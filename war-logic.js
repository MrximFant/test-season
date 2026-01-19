window.warRoom = function() {
    return {
        version: '10.0.0',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        tab: 'warroom', loading: true, searchQuery: '',
        alliances: [], processedAlliances: [], simAlliances: [],
        kageGroups: [], koubuGroups: [], kageSimGroups: [], koubuSimGroups: [],
        openGroups: [], alliancePlayers: {}, showGlobalMobile: false,
        displayClock: '', phaseCountdown: '', week: 1, 
        seasonStart: new Date("2026-01-05T03:00:00+01:00"), 
        
        // --- ADVANCED PLANNER STATE ---
        planner: [],
        simRange: { start: 1, end: 20 },
        stableTargets: [],
        includeIncome: true, // New: Toggle to project rate until next lock

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            this.updateClockOnly(); 
            await this.fetchData();
            
            const savedPlan = localStorage.getItem('kage_war_plan_v10');
            if (savedPlan) {
                try {
                    this.planner = JSON.parse(savedPlan).map(p => ({
                        ...p, kage: this.processedAlliances.find(a => a.id === p.kageId)
                    })).filter(p => p.kage);
                } catch(e) { this.setupPlanner(); }
            } else { this.setupPlanner(); }

            setInterval(() => { this.updateClockOnly(); }, 1000);
        },

        async fetchData() {
            try {
                const { data, error } = await this.client.from('war_master_view').select('*');
                if (error) throw error;
                this.alliances = data || [];
                this.refreshStashMath();
                this.updateStableTargets();
                this.loading = false;
            } catch (e) { console.error("Fetch Error:", e); }
        },

        // --- PREDICTIVE ENGINE V10 ---
        runSimulation() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const nextLock = this.getNextLock(cet);

            // 1. Initialize simulation data with current Lock Stash
            let simData = this.processedAlliances.map(a => {
                let s = { ...a, simStash: a.lockStash, simGain: 0, simLoss: 0 };
                // Add Income Projection if toggled
                if (this.includeIncome && a.isProjected === false) {
                    const scoutTime = new Date(a.last_scout_time);
                    const hrsToNextLock = (nextLock - scoutTime) / 3600000;
                    s.simStash = Number(a.last_copper || 0) + (a.rate * hrsToNextLock);
                }
                return s;
            });

            // 2. Apply Offensive and Defensive Transfers
            this.planner.forEach(p => {
                const usIdx = simData.findIndex(x => x.id === p.kageId);
                
                // OFFENSE: We hit them
                if (p.offenseTargetId && !p.offenseZero) {
                    const themIdx = simData.findIndex(x => x.id === p.offenseTargetId);
                    if (usIdx > -1 && themIdx > -1) {
                        const targetLock = simData[themIdx].lockStash;
                        let pct = p.offenseBuildings.length > 0 ? 0 : 0.15;
                        p.offenseBuildings.forEach(b => pct += (b === 3 ? 0.06 : 0.03));
                        const stolen = Math.floor(targetLock * pct);
                        simData[usIdx].simStash += stolen;
                        simData[themIdx].simStash -= stolen;
                    }
                }

                // DEFENSE: They hit us
                if (p.defenseTargetId && !p.defenseZero) {
                    const enemyIdx = simData.findIndex(x => x.id === p.defenseTargetId);
                    if (usIdx > -1 && enemyIdx > -1) {
                        const ourLock = simData[usIdx].lockStash;
                        let pct = p.defenseBuildings.length > 0 ? 0 : 0.15;
                        p.defenseBuildings.forEach(b => pct += (b === 3 ? 0.06 : 0.03));
                        const lost = Math.floor(ourLock * pct);
                        simData[usIdx].simStash -= lost;
                        simData[enemyIdx].simStash += lost;
                    }
                }
            });

            this.simAlliances = simData.sort((a,b) => b.simStash - a.simStash);
            this.simAlliances.forEach((a, i) => a.globalSimRank = i + 1);
            this.kageSimGroups = this.calculateGroups(this.simAlliances, 'Kage');
            this.koubuSimGroups = this.calculateGroups(this.simAlliances, 'Koubu');
            this.tab = 'results';
        },

        setupPlanner() {
            this.refreshStashMath();
            const sortedKage = this.processedAlliances.filter(a => (a.faction||'').toLowerCase().includes('kage')).sort((a,b) => a.liveRank - b.liveRank);
            const filtered = sortedKage.slice(this.simRange.start - 1, this.simRange.end);
            this.planner = filtered.map(a => ({ 
                kageId: a.id, kage: a, 
                offenseTargetId: '', offenseBuildings: [], offenseZero: false,
                defenseTargetId: '', defenseBuildings: [], defenseZero: false 
            }));
            this.savePlan();
        },

        toggleBldg(idx, bIdx, type) {
            const p = this.planner[idx];
            const key = type === 'off' ? 'offenseBuildings' : 'defenseBuildings';
            p[type === 'off' ? 'offenseZero' : 'defenseZero'] = false;
            let current = [...p[key]];
            const pos = current.indexOf(bIdx);
            if (pos > -1) current.splice(pos, 1); else current.push(bIdx);
            p[key] = current;
            this.savePlan();
        },

        savePlan() { localStorage.setItem('kage_war_plan_v10', JSON.stringify(this.planner)); },

        // --- CORE MATH ---
        refreshStashMath() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const lastLock = this.getPrevLock(cet);
            const nextLock = this.getNextLock(cet);
            const isProjection = cet >= this.getWarEndTime(cet);
            const activeLock = isProjection ? nextLock : lastLock;

            let raw = this.alliances.map(a => {
                let rate = Number(a.city_rate) > 0 ? Number(a.city_rate) : Number(a.observed_rate || 0);
                const scoutTime = new Date(a.last_scout_time);
                const hrsLock = (activeLock - scoutTime) / 3600000;
                const hrsLive = (cet - scoutTime) / 3600000;
                return { 
                    ...a, stash: Number(a.last_copper || 0) + (rate * hrsLive), 
                    lockStash: Number(a.last_copper || 0) + (rate * hrsLock),
                    isProjected: isProjection, rate: rate 
                };
            });

            raw.sort((a,b) => b.stash - a.stash).forEach((a, i) => a.globalRank = i + 1);
            ['Kage no Sato', 'Koubu'].forEach(f => {
                raw.filter(a => (a.faction||'').includes(f)).sort((a, b) => b.stash - a.stash).forEach((a, i) => { a.liveRank = i + 1; });
            });

            this.processedAlliances = raw;
            this.kageGroups = this.calculateGroups(this.processedAlliances, 'Kage');
            this.koubuGroups = this.calculateGroups(this.processedAlliances, 'Koubu');
        },

        calculateGroups(data, factionQuery) {
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            const sortKey = (this.tab === 'results') ? 'simStash' : 'stash';
            const sorted = data.filter(a => (a.faction||'').toLowerCase().includes(factionQuery.toLowerCase())).sort((a,b) => b[sortKey] - a[sortKey]);
            const groups = [];
            for (let i=0; i < sorted.length && i < 30; i+=step) {
                groups.push({ id: factionQuery + (Math.floor(i/step)+1), label: `Rank ${i+1}-${Math.min(i+step, 30)}`, alliances: sorted.slice(i, i+step).map((it, idx) => ({ ...it, factionRank: i+idx+1 })) });
            }
            if (sorted.length > 30) groups.push({ id: factionQuery + '99', label: 'Rank 31-100', alliances: sorted.slice(30, 100).map((it, idx) => ({ ...it, factionRank: 31+idx })) });
            return groups;
        },

        getPrevLock(n) { let t = new Date(n); t.setHours(3,0,0,0); while (t > n || (t.getDay() !== 1 && t.getDay() !== 4)) t.setDate(t.getDate()-1); return t; },
        getNextLock(n) { let t = new Date(n); t.setHours(3,0,0,0); while (t <= n || (t.getDay() !== 1 && t.getDay() !== 4)) t.setDate(t.getDate()+1); return t; },
        getWarEndTime(n) { let t = new Date(n); t.setHours(18,0,0,0); while (t.getDay() !== 3 && t.getDay() !== 6) t.setDate(t.getDate()-1); return t; },
        updateClockOnly() {
            const cet = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
            this.week = Math.max(1, Math.floor((cet - this.seasonStart) / 86400000 / 7) + 1);
            let tWar = new Date(cet); tWar.setHours(15,30,0,0); while (tWar <= cet || (tWar.getDay() !== 3 && tWar.getDay() !== 6)) tWar.setDate(tWar.getDate()+1);
            const dff = tWar - cet; this.phaseCountdown = `${Math.floor(dff/36e5)}h ${Math.floor((dff%36e5)/6e4)}m`;
        },
        updateStableTargets() { this.stableTargets = this.processedAlliances.filter(x => (x.faction||'').includes('Koubu')).sort((a,b) => a.liveRank - b.liveRank); },
        async toggleAlliancePlayers(aId) {
            if (this.alliancePlayers[aId]) { delete this.alliancePlayers[aId]; return; }
            const { data } = await this.client.from('players').select('*').eq('alliance_id', aId).order('thp', {ascending: false});
            this.alliancePlayers[aId] = data;
        },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); }
    }
}
