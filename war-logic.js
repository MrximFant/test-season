window.warRoom = function() {
    return {
        version: '7.0.0',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        tab: 'warroom', loading: true, searchQuery: '',
        alliances: [], processedAlliances: [], simAlliances: [],
        openGroups: [], openServers: [], alliancePlayers: {}, // { allianceId: [players] }
        displayClock: '', currentRoundText: '', phaseCountdown: '',
        week: 1, seasonStart: new Date("2026-01-05T03:00:00+01:00"), 
        planner: [], simRange: { start: 1, end: 20 },

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            await this.fetchData();
            
            const savedPlan = localStorage.getItem('kage_war_plan');
            if (savedPlan) {
                this.planner = JSON.parse(savedPlan).map(p => ({
                    ...p, kage: this.processedAlliances.find(a => a.id === p.kageId)
                })).filter(p => p.kage);
            } else { this.setupPlanner(); }

            setInterval(() => { this.updateClockOnly(); this.refreshStashMath(); }, 1000);
        },

        async fetchData() {
            this.loading = true;
            try {
                const { data, error } = await this.client.from('war_master_view').select('*');
                if (error) throw error;
                this.alliances = data || [];
                this.refreshStashMath(); 
            } catch (e) { console.error("Sync Error:", e); }
            this.loading = false;
        },

        // --- SERVER INTEL LOGIC ---
        get uniqueServers() {
            const servers = [...new Set(this.alliances.map(a => a.server))];
            return servers.sort((a,b) => parseInt(a) - parseInt(b));
        },
        getAlliancesByServer(srv) {
            return this.processedAlliances.filter(a => a.server === srv).sort((a,b) => b.ace_thp - a.ace_thp);
        },
        async toggleAlliancePlayers(aId) {
            if (this.alliancePlayers[aId]) { delete this.alliancePlayers[aId]; return; }
            const { data } = await this.client.from('players').select('*').eq('alliance_id', aId).order('thp', {ascending: false});
            this.alliancePlayers[aId] = data;
        },

        // --- TIME ENGINE (CET) ---
        refreshStashMath() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            
            const lastLock = this.getPrevLock(cet);
            const nextLock = this.getNextLock(cet);
            const warEnd = this.getWarEndTime(cet);
            
            // Switch to "Future Grouping" mode after war ends (Wed/Sat 18:00)
            const isProjection = cet >= warEnd;
            const activeLock = isProjection ? nextLock : lastLock;

            this.processedAlliances = this.alliances.map(a => {
                let rate = Number(a.city_rate) > 0 ? Number(a.city_rate) : Number(a.observed_rate || 0);
                const scoutTime = new Date(a.last_scout_time);
                const hrsLock = (activeLock - scoutTime) / 3600000;
                const hrsLive = (cet - scoutTime) / 3600000;
                
                return { 
                    ...a, 
                    stash: Number(a.last_copper || 0) + (rate * hrsLive), 
                    lockStash: Number(a.last_copper || 0) + (rate * hrsLock),
                    isProjected: isProjection,
                    rate: rate 
                };
            });
        },

        getPrevLock(n) {
            let t = new Date(n); t.setHours(3,0,0,0);
            while (t > n || (t.getDay() !== 1 && t.getDay() !== 4)) t.setDate(t.getDate()-1);
            return t;
        },
        getNextLock(n) {
            let t = new Date(n); t.setHours(3,0,0,0);
            while (t <= n || (t.getDay() !== 1 && t.getDay() !== 4)) t.setDate(t.getDate()+1);
            return t;
        },
        getWarEndTime(n) {
            let t = new Date(n); t.setHours(18,0,0,0); // Swapping at 18:00 CET
            while (t.getDay() !== 3 && t.getDay() !== 6) t.setDate(t.getDate()-1);
            return t;
        },
        updateClockOnly() {
            const cet = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
            this.week = Math.max(1, Math.floor((cet - this.seasonStart) / 604800000) + 1);
            
            let tWar = new Date(cet); tWar.setHours(15,30,0,0);
            while (tWar <= cet || (tWar.getDay() !== 3 && tWar.getDay() !== 6)) tWar.setDate(tWar.getDate()+1);
            const dff = tWar - cet;
            this.phaseCountdown = `${Math.floor(dff/36e5)}h ${Math.floor((dff%36e5)/6e4)}m`;
        },

        // --- SIMULATION ---
        setupPlanner() {
            const topKage = this.getGroupedFaction('Kage').flatMap(g => g.alliances).slice(this.simRange.start-1, this.simRange.end);
            this.planner = topKage.map(a => ({ kageId: a.id, kage: a, targetId: '', buildings: [], isZero: false, estStolen: 0 }));
        },
        calculateMatch(idx) {
            const p = this.planner[idx];
            const target = this.processedAlliances.find(a => a.id === p.targetId);
            if (!target || p.isZero) p.estStolen = 0;
            else {
                let pct = p.buildings.length > 0 ? 0 : 0.15;
                p.buildings.forEach(b => pct += (b === 3 ? 0.06 : 0.03));
                p.estStolen = Math.floor(target.lockStash * pct);
            }
            localStorage.setItem('kage_war_plan', JSON.stringify(this.planner));
        },
        runSimulation() {
            let simData = this.processedAlliances.map(a => ({ ...a, simStash: a.lockStash }));
            this.planner.forEach(p => {
                if (p.targetId) {
                    const usIdx = simData.findIndex(x => x.id === p.kageId);
                    const themIdx = simData.findIndex(x => x.id === p.targetId);
                    if (usIdx > -1) simData[usIdx].simStash += p.estStolen;
                    if (themIdx > -1) simData[themIdx].simStash -= p.estStolen;
                }
            });
            this.simAlliances = simData.sort((a,b) => b.simStash - a.simStash);
            this.tab = 'results';
        },

        // --- UI HELPERS ---
        getGroupedFaction(f, data = null) {
            const src = data || this.processedAlliances;
            const sorted = src.filter(a => (a.faction||'').toLowerCase().includes(f.toLowerCase()))
                             .sort((a,b) => (a.simStash || a.lockStash) > (b.simStash || b.lockStash) ? -1 : 1);
            const groups = [];
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            for (let i=0; i < sorted.length && i < 30; i+=step) {
                groups.push({ id: Math.floor(i/step)+1, label: `Group ${Math.floor(i/step)+1}`, alliances: sorted.slice(i, i+step).map((it, idx) => ({ ...it, factionRank: i+idx+1 })) });
            }
            return groups;
        },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); }
    }
}
