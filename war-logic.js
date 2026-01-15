window.warRoom = function() {
    return {
        // --- CONFIG ---
        version: '9.2.0',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        // --- STATE ---
        tab: 'warroom', loading: true, searchQuery: '',
        alliances: [], processedAlliances: [], simAlliances: [],
        openGroups: [], alliancePlayers: {}, 
        showGlobalMobile: false,
        displayClock: '', phaseCountdown: '',
        week: 1, seasonStart: new Date("2026-01-05T03:00:00+01:00"), 
        
        planner: [],
        simRange: { start: 1, end: 20 },
        stableTargets: [], // Used for dropdowns to prevent flickering

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            await this.fetchData();
            
            // Initial stability sync
            this.updateStableTargets();

            const savedPlan = localStorage.getItem('kage_war_plan');
            if (savedPlan) {
                try {
                    const parsed = JSON.parse(savedPlan);
                    this.planner = parsed.map(p => ({
                        ...p,
                        buildings: p.buildings || [],
                        kage: this.processedAlliances.find(a => a.id === p.kageId)
                    })).filter(p => p.kage);
                } catch(e) { this.setupPlanner(); }
            } else { this.setupPlanner(); }

            // Throttled UI Loops
            setInterval(() => { this.updateClockOnly(); }, 1000); // Clock fast
            setInterval(() => { 
                // Only refresh math/targets if not actively using the simulation dropdowns
                if (this.tab !== 'sim') {
                    this.refreshStashMath(); 
                    this.updateStableTargets();
                }
            }, 10000); // Math slow (10s) to prevent UI flicker
        },

        async fetchData() {
            this.loading = true;
            try {
                const { data, error } = await this.client.from('war_master_view').select('*');
                if (error) throw error;
                this.alliances = data || [];
                this.refreshStashMath(); 
            } catch (e) { console.error("Database Sync Error:", e); }
            this.loading = false;
        },

        updateStableTargets() {
            this.stableTargets = this.processedAlliances
                .filter(x => (x.faction||'').includes('Koubu'))
                .sort((x,y) => x.liveRank - y.liveRank)
                .map(a => ({ id: a.id, tag: a.tag, name: a.name, liveRank: a.liveRank }));
        },

        // --- TIME & STASH ENGINE ---
        refreshStashMath() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const lastLock = this.getPrevLock(cet);
            const nextLock = this.getNextLock(cet);
            const warEnd = this.getWarEndTime(cet);
            const activeLock = cet >= warEnd ? nextLock : lastLock;

            let raw = this.alliances.map(a => {
                let rate = Number(a.city_rate) > 0 ? Number(a.city_rate) : Number(a.observed_rate || 0);
                const scoutTime = new Date(a.last_scout_time);
                const hrsLock = (activeLock - scoutTime) / 3600000;
                const hrsLive = (cet - scoutTime) / 3600000;
                return { 
                    ...a, 
                    stash: Number(a.last_copper || 0) + (rate * hrsLive), 
                    lockStash: Number(a.last_copper || 0) + (rate * hrsLock),
                    rate: rate 
                };
            });

            // Global Rank (1-200) based on Live Stash
            raw.sort((a,b) => b.stash - a.stash).forEach((a, i) => a.globalRank = i + 1);

            // Faction Rank (1-100) based on Live Stash
            ['Kage no Sato', 'Koubu'].forEach(f => {
                raw.filter(a => (a.faction||'').includes(f))
                    .sort((a, b) => b.stash - a.stash)
                    .forEach((a, i) => { a.liveRank = i + 1; });
            });
            this.processedAlliances = raw;
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
            let t = new Date(n); t.setHours(18,0,0,0);
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

        // --- PLANNER & SIMULATION ---
        setupPlanner() {
            this.refreshStashMath();
            const sortedKage = this.processedAlliances
                .filter(a => (a.faction||'').toLowerCase().includes('kage'))
                .sort((a,b) => a.liveRank - b.liveRank);
            const filtered = sortedKage.slice(this.simRange.start - 1, this.simRange.end);
            this.planner = filtered.map(a => ({ kageId: a.id, kage: a, targetId: '', buildings: [], isZero: false, estStolen: 0 }));
            this.updateStableTargets();
            this.savePlan();
        },
        toggleBuilding(idx, bIdx) {
            const p = this.planner[idx]; p.isZero = false;
            let current = [...p.buildings]; const pos = current.indexOf(bIdx);
            if (pos > -1) current.splice(pos, 1); else current.push(bIdx);
            p.buildings = current; this.calculateMatch(idx);
        },
        setZero(idx) {
            const p = this.planner[idx]; p.isZero = !p.isZero;
            if (p.isZero) p.buildings = []; this.calculateMatch(idx);
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
            this.savePlan();
        },
        savePlan() { localStorage.setItem('kage_war_plan', JSON.stringify(this.planner)); },
        runSimulation() {
            let simData = this.processedAlliances.map(a => ({ ...a, simStash: a.lockStash }));
            this.planner.forEach(p => {
                if (p.targetId && !p.isZero) {
                    const usIdx = simData.findIndex(x => x.id === p.kageId);
                    const themIdx = simData.findIndex(x => x.id === p.targetId);
                    if (usIdx > -1) simData[usIdx].simStash += p.estStolen;
                    if (themIdx > -1) simData[themIdx].simStash -= p.estStolen;
                }
            });
            this.simAlliances = simData.sort((a,b) => b.simStash - a.simStash);
            this.simAlliances.forEach((a, i) => a.globalSimRank = i + 1);
            this.tab = 'results';
        },

        // --- HELPERS ---
        getGroupedFaction(f, data = null) {
            const src = data || this.processedAlliances;
            const sortKey = data ? 'simStash' : 'stash';
            const sorted = src.filter(a => (a.faction||'').toLowerCase().includes(f.toLowerCase())).sort((a,b) => b[sortKey] - a[sortKey]);
            const groups = []; const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            for (let i=0; i < sorted.length && i < 30; i+=step) {
                groups.push({ id: Math.floor(i/step)+1, label: `Group ${Math.floor(i/step)+1}`, alliances: sorted.slice(i, i+step).map((it, idx) => ({ ...it, factionRank: i+idx+1 })) });
            }
            return groups;
        },
        async toggleAlliancePlayers(aId) {
            if (this.alliancePlayers[aId]) { delete this.alliancePlayers[aId]; return; }
            const { data } = await this.client.from('players').select('*').eq('alliance_id', aId).order('thp', {ascending: false});
            this.alliancePlayers[aId] = data;
        },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); }
    }
}
