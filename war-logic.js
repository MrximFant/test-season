window.warRoom = function() {
    return {
        // --- CONFIG ---
        version: '4.1.0',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        // --- STATE ---
        tab: 'warroom', loading: true, searchQuery: '',
        alliances: [], processedAlliances: [], 
        openGroups: [], strikePlan: {},
        displayClock: '', currentRoundText: '', currentPhase: '', phaseCountdown: '',
        week: 1, seasonStart: new Date("2026-01-05T03:00:00+01:00"), 
        planner: [], 

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            
            // 1. Fetch Data First
            await this.fetchData();
            
            // 2. Initialize the Planner once data exists
            this.setupPlanner();

            // 3. Start UI Loops
            setInterval(() => { 
                this.updateClockOnly(); 
                this.refreshStashMath(); 
            }, 1000);
        },

        async fetchData() {
            this.loading = true;
            try {
                const { data, error } = await this.client.from('war_master_view').select('*');
                if (error) throw error;
                this.alliances = data || [];
                // Run math immediately so getGroupedFaction works
                this.refreshStashMath(); 
            } catch (e) { console.error("Fetch Error:", e); }
            this.loading = false;
        },

        setupPlanner() {
            // Get our top 20 based on group ranking
            const topKage = this.getGroupedFaction('Kage').flatMap(g => g.alliances).slice(0, 20);
            this.planner = topKage.map(a => ({ 
                kage: a, 
                targetId: '', 
                estStolen: 0 
            }));
        },

        // --- MATCHMAKING LOGIC ---
        getPossibleTargets(kageAlliance) {
            const kGroups = this.getGroupedFaction('Kage');
            const qGroups = this.getGroupedFaction('Koubu');
            
            // Find which Rank Group our alliance is in
            const myGroup = kGroups.find(g => g.alliances.some(a => a.id === kageAlliance.id));
            if (!myGroup) return [];

            // Return targets in the exact same Rank Group from Koubu
            const targetGroup = qGroups.find(g => g.id === myGroup.id);
            return targetGroup ? targetGroup.alliances : [];
        },

        updateEstStolen(index) {
            const plan = this.planner[index];
            const target = this.processedAlliances.find(a => a.id === plan.targetId);
            if (target) {
                // Default to 15% of the target's predicted warStash
                plan.estStolen = Math.floor(target.warStash * 0.15);
            } else {
                plan.estStolen = 0;
            }
        },

        getTotalStolen() {
            return this.planner.reduce((sum, p) => sum + (Number(p.estStolen) || 0), 0);
        },

        // --- CORE MATH ---
        getGroupedFaction(fName) {
            // Flexible matching: includes 'Kage' or 'Koubu'
            const sorted = [...this.processedAlliances]
                .filter(a => (a.faction || '').toLowerCase().includes(fName.toLowerCase()))
                .sort((a,b) => b.rankingStash - a.rankingStash);
            
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

        refreshStashMath() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const warTime = this.getNextWarTime();
            const groupTime = this.getGroupingStartTime(now);

            this.processedAlliances = this.alliances.map(a => {
                let rate = Number(a.city_rate) > 0 ? Number(a.city_rate) : Number(a.observed_rate || 0);
                const scoutTime = new Date(a.last_scout_time);
                const hrsSince = Math.max(0, (cet - scoutTime) / 3600000);
                const current = Number(a.last_copper || 0) + (rate * hrsSince);
                
                return { 
                    ...a, 
                    stash: current, 
                    warStash: current + (rate * (Math.max(0, (warTime - cet) / 3600000))),
                    groupStash: current + (rate * (Math.max(0, (groupTime - cet) / 3600000))),
                    rankingStash: current, 
                    rate: rate 
                };
            });
        },

        // --- TIME HELPERS ---
        getNextWarTime() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let t = new Date(cet); t.setHours(15, 30, 0, 0);
            while (t <= cet || (t.getDay() !== 3 && t.getDay() !== 6)) {
                t.setDate(t.getDate() + 1);
            }
            return t;
        },

        getGroupingStartTime(base) {
            let t = new Date(base.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const d = t.getDay();
            // Monday 03:00 or Thursday 03:00
            if (d >= 1 && d < 4 && !(d === 4 && t.getHours() >= 3)) {
                t.setDate(t.getDate() + (4 - d));
            } else {
                t.setDate(t.getDate() + (d === 0 ? 1 : 8 - d));
            }
            t.setHours(3, 0, 0, 0); return t;
        },

        updateClockOnly() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            const diffDays = Math.floor((cet - this.seasonStart) / 864e5);
            this.week = Math.max(1, Math.floor(diffDays / 7) + 1);
            const dff = this.getNextWarTime() - cet;
            this.phaseCountdown = `${Math.floor(dff/36e5)}h ${Math.floor((dff%36e5)/6e4)}m`;
        },

        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1e9).toFixed(1) + 'B'; },
        toggleGroup(f, id) { 
            const key = `${f}-${id}`; 
            this.openGroups = this.openGroups.includes(key) ? this.openGroups.filter(k => k !== key) : [...this.openGroups, key]; 
        },
        matchesSearch(a) { 
            const q = this.searchQuery.toLowerCase();
            return !q || a.name.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q); 
        }
    }
}
