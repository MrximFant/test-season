window.warRoom = function() {
    return {
        // --- CONFIG ---
        version: '5.0.0',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        // --- STATE ---
        tab: 'warroom', loading: true, searchQuery: '',
        alliances: [], processedAlliances: [], 
        openGroups: [], strikePlan: {},
        displayClock: '', currentRoundText: '', currentPhase: '', phaseCountdown: '',
        week: 1, seasonStart: new Date("2026-01-05T03:00:00+01:00"), 
        
        // --- PLANNER STATE ---
        planner: [],
        simRange: { start: 1, end: 20 },

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            await this.fetchData();
            this.setupPlanner();
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
                kage: a, 
                targetId: '', 
                buildings: [], // Indices: 0,1,2 (3%), 3 (6%)
                manualPlunder: 0 
            }));
        },

        // --- STRIKE PLANNER LOGIC ---
        toggleBuilding(planIndex, bIndex) {
            const plan = this.planner[planIndex];
            const idx = plan.buildings.indexOf(bIndex);
            if (idx > -1) plan.buildings.splice(idx, 1);
            else plan.buildings.push(bIndex);
            this.calculateMatchPlunder(planIndex);
        },

        calculateMatchPlunder(index) {
            const plan = this.planner[index];
            const target = this.processedAlliances.find(a => a.id === plan.targetId);
            if (!target) return plan.manualPlunder = 0;
            
            // Logic: Plunder is ALWAYS calculated off the Locked Stash
            let totalPct = 0;
            plan.buildings.forEach(b => { totalPct += (b === 3 ? 0.06 : 0.03); });
            
            // If no buildings selected, show 15% Max as default
            if (plan.buildings.length === 0) totalPct = 0.15;
            
            plan.manualPlunder = Math.floor(target.lockStash * totalPct);
        },

        getTotalSimPlunder() {
            return this.planner.reduce((sum, p) => sum + (Number(p.manualPlunder) || 0), 0);
        },

        // --- TIME & LOCK ENGINE ---
        refreshStashMath() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            
            // Anchors
            const lastLock = this.getPrevLockTime(cet);
            const nextLock = this.getNextLockTime(cet);
            const warEndTime = this.getWarEndTime(cet);
            
            // Rule: After war ends (17:30 Wed/Sat), we look at the FUTURE lock
            const isFutureMode = cet >= warEndTime;
            const activeLockTime = isFutureMode ? nextLock : lastLock;

            this.processedAlliances = this.alliances.map(a => {
                let rate = Number(a.city_rate) > 0 ? Number(a.city_rate) : Number(a.observed_rate || 0);
                const scoutTime = new Date(a.last_scout_time);
                const hrsSince = Math.max(0, (cet - scoutTime) / 3600000);
                const current = Number(a.last_copper || 0) + (rate * hrsSince);
                
                // Calculate stash at the specific lock time
                const hrsToLock = (activeLockTime - scoutTime) / 3600000;
                const lockStash = Number(a.last_copper || 0) + (rate * hrsToLock);

                return { 
                    ...a, 
                    stash: current, 
                    lockStash: lockStash,
                    isProjected: isFutureMode,
                    rate: rate 
                };
            });
        },

        getPrevLockTime(now) {
            let t = new Date(now); t.setHours(3, 0, 0, 0);
            while (t > now || (t.getDay() !== 1 && t.getDay() !== 4)) {
                t.setDate(t.getDate() - 1);
            }
            return t;
        },

        getNextLockTime(now) {
            let t = new Date(now); t.setHours(3, 0, 0, 0);
            while (t <= now || (t.getDay() !== 1 && t.getDay() !== 4)) {
                t.setDate(t.getDate() + 1);
            }
            return t;
        },

        getWarEndTime(now) {
            let t = new Date(now); t.setHours(17, 30, 0, 0);
            while (t.getDay() !== 3 && t.getDay() !== 6) { t.setDate(t.getDate() - 1); }
            if (t > now) { // Find previous war end
                t.setDate(t.getDate() - 3);
                while (t.getDay() !== 3 && t.getDay() !== 6) { t.setDate(t.getDate() - 1); }
            }
            return t;
        },

        getNextWarTime() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let t = new Date(cet); t.setHours(15, 30, 0, 0);
            while (t <= cet || (t.getDay() !== 3 && t.getDay() !== 6)) { t.setDate(t.getDate() + 1); }
            return t;
        },

        updateClockOnly() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            this.week = Math.max(1, Math.floor((cet - this.seasonStart) / 864e5 / 7) + 1);
            const dff = this.getNextWarTime() - cet;
            this.phaseCountdown = `${Math.floor(dff/36e5)}h ${Math.floor((dff%36e5)/6e4)}m`;
        },

        // --- DATA HELPERS ---
        getGroupedFaction(fName) {
            const sorted = [...this.processedAlliances]
                .filter(a => (a.faction || '').toLowerCase().includes(fName.toLowerCase()))
                .sort((a,b) => b.lockStash - a.lockStash);
            const groups = [];
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            for (let i=0; i < sorted.length && i < 30; i+=step) {
                groups.push({ 
                    id: Math.floor(i/step)+1, 
                    label: `Rank ${i+1}-${Math.min(i+step, 30)}`, 
                    alliances: sorted.slice(i, i+step).map((it, idx) => ({ ...it, factionRank: i+idx+1 })) 
                });
            }
            return groups;
        },

        getPossibleTargets(kageId) {
            const kage = this.processedAlliances.find(a => a.id === kageId);
            const kGroups = this.getGroupedFaction('Kage');
            const qGroups = this.getGroupedFaction('Koubu');
            const myGroup = kGroups.find(g => g.alliances.some(a => a.id === kage.id));
            if (!myGroup) return [];
            const targetGroup = qGroups.find(g => g.id === myGroup.id);
            return targetGroup ? targetGroup.alliances : [];
        },

        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1e9).toFixed(1) + 'B'; },
        toggleGroup(f, id) { 
            const key = `${f}-${id}`; 
            this.openGroups = this.openGroups.includes(key) ? this.openGroups.filter(k => k !== key) : [...this.openGroups, key]; 
        }
    }
}
