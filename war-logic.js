window.warRoom = function() {
    return {
        // --- CONFIG ---
        version: '6.0.0',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        // --- STATE ---
        tab: 'warroom', loading: true, searchQuery: '',
        alliances: [], processedAlliances: [], simAlliances: [],
        openGroups: [], authenticated: false, passInput: '',
        displayClock: '', currentRoundText: '', phaseCountdown: '',
        week: 1, seasonStart: new Date("2026-01-05T03:00:00+01:00"), 
        
        // --- PLANNER & PERSISTENCE ---
        planner: [],
        simRange: { start: 1, end: 20 },

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            await this.fetchData();
            
            // Load Saved Plan
            const savedPlan = localStorage.getItem('kage_war_plan');
            if (savedPlan) {
                const parsed = JSON.parse(savedPlan);
                this.planner = parsed.map(p => ({
                    ...p,
                    kage: this.alliances.find(a => a.id === p.kageId) || null
                })).filter(p => p.kage);
            } else {
                this.setupPlanner();
            }

            setInterval(() => { this.updateClockOnly(); this.refreshStashMath(); }, 1000);
        },

        async fetchData() {
            this.loading = true;
            try {
                const { data } = await this.client.from('war_master_view').select('*');
                this.alliances = data || [];
                this.refreshStashMath(); 
            } catch (e) { console.error(e); }
            this.loading = false;
        },

        setupPlanner() {
            const allKage = this.getGroupedFaction('Kage').flatMap(g => g.alliances);
            const filtered = allKage.slice(this.simRange.start - 1, this.simRange.end);
            this.planner = filtered.map(a => ({ 
                kageId: a.id,
                kage: a, 
                targetId: '', 
                buildings: [], 
                isZero: false,
                estStolen: 0 
            }));
            this.savePlan();
        },

        savePlan() {
            localStorage.setItem('kage_war_plan', JSON.stringify(this.planner.map(p => ({
                kageId: p.kageId, targetId: p.targetId, buildings: p.buildings, isZero: p.isZero, estStolen: p.estStolen
            }))));
        },

        clearPlan() {
            if(confirm("Reset all targets and simulations?")) {
                localStorage.removeItem('kage_war_plan');
                this.setupPlanner();
            }
        },

        toggleBuilding(idx, bIdx) {
            const p = this.planner[idx];
            p.isZero = false;
            const bPos = p.buildings.indexOf(bIdx);
            if (bPos > -1) p.buildings.splice(bPos, 1);
            else p.buildings.push(bIdx);
            this.calculateMatch(idx);
        },

        setZero(idx) {
            const p = this.planner[idx];
            p.isZero = !p.isZero;
            if (p.isZero) p.buildings = [];
            this.calculateMatch(idx);
        },

        calculateMatch(idx) {
            const p = this.planner[idx];
            const target = this.processedAlliances.find(a => a.id === p.targetId);
            if (!target || p.isZero) { p.estStolen = 0; }
            else {
                let pct = p.buildings.length > 0 ? 0 : 0.15;
                p.buildings.forEach(b => { pct += (b === 3 ? 0.06 : 0.03); });
                p.estStolen = Math.floor(target.lockStash * pct);
            }
            this.savePlan();
        },

        // --- THE PREDICTIVE ENGINE ---
        runSimulation() {
            // 1. Start with the predicted "Natural" Lock Stash for everyone
            let simData = this.processedAlliances.map(a => ({ ...a, simStash: a.lockStash }));

            // 2. Apply simulated transfers
            this.planner.forEach(p => {
                if (p.targetId) {
                    const kageIdx = simData.findIndex(a => a.id === p.kageId);
                    const koubuIdx = simData.findIndex(a => a.id === p.targetId);
                    
                    if (kageIdx > -1) simData[kageIdx].simStash += p.estStolen;
                    if (koubuIdx > -1) simData[koubuIdx].simStash -= p.estStolen;
                }
            });

            // 3. Re-sort and re-rank
            this.simAlliances = simData.sort((a,b) => b.simStash - a.simStash);
            this.tab = 'results';
        },

        // --- MATH ENGINE ---
        refreshStashMath() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const lastLock = this.getPrevLockTime(cet);
            const nextLock = this.getNextLockTime(cet);
            const warEndTime = this.getWarEndTime(cet);
            const isFutureMode = cet >= warEndTime;
            const activeLockTime = isFutureMode ? nextLock : lastLock;

            this.processedAlliances = this.alliances.map(a => {
                let rate = Number(a.city_rate) > 0 ? Number(a.city_rate) : Number(a.observed_rate || 0);
                const scoutTime = new Date(a.last_scout_time);
                const hrsToLock = (activeLockTime - scoutTime) / 3600000;
                const hrsLive = (cet - scoutTime) / 3600000;
                
                return { 
                    ...a, 
                    stash: Number(a.last_copper || 0) + (rate * hrsLive), 
                    lockStash: Number(a.last_copper || 0) + (rate * hrsToLock),
                    isProjected: isFutureMode, rate: rate 
                };
            });
        },

        getPrevLockTime(n) {
            let t = new Date(n); t.setHours(3,0,0,0);
            while (t > n || (t.getDay() !== 1 && t.getDay() !== 4)) t.setDate(t.getDate()-1);
            return t;
        },
        getNextLockTime(n) {
            let t = new Date(n); t.setHours(3,0,0,0);
            while (t <= n || (t.getDay() !== 1 && t.getDay() !== 4)) t.setDate(t.getDate()+1);
            return t;
        },
        getWarEndTime(n) {
            let t = new Date(n); t.setHours(17,30,0,0);
            while (t.getDay() !== 3 && t.getDay() !== 6) t.setDate(t.getDate()-1);
            return t;
        },
        getNextWarTime() {
            const cet = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let t = new Date(cet); t.setHours(15,30,0,0);
            while (t <= cet || (t.getDay() !== 3 && t.getDay() !== 6)) t.setDate(t.getDate()+1);
            return t;
        },
        updateClockOnly() {
            const cet = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            const dff = this.getNextWarTime() - cet;
            this.phaseCountdown = `${Math.floor(dff/36e5)}h ${Math.floor((dff%36e5)/6e4)}m`;
        },

        getGroupedFaction(f, data = null) {
            const src = data || this.processedAlliances;
            const sorted = src.filter(a => (a.faction||'').toLowerCase().includes(f.toLowerCase()))
                             .sort((a,b) => (a.simStash || a.lockStash) > (b.simStash || b.lockStash) ? -1 : 1);
            const groups = [];
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            for (let i=0; i < sorted.length && i < 30; i+=step) {
                groups.push({ id: Math.floor(i/step)+1, label: `Rank ${i+1}-${Math.min(i+step, 30)}`, alliances: sorted.slice(i, i+step).map((it, idx) => ({ ...it, factionRank: i+idx+1 })) });
            }
            return groups;
        },

        getPossibleTargets(kageId) {
            const kage = this.processedAlliances.find(a => a.id === kageId);
            if (!kage) return [];
            const kGroups = this.getGroupedFaction('Kage');
            const myG = kGroups.find(g => g.alliances.some(a => a.id === kageId));
            return this.getGroupedFaction('Koubu').find(g => g.id === myG?.id)?.alliances || [];
        },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); }
    }
}
