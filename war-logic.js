window.warRoom = function() {
    return {
        // --- CONFIG ---
        version: '4.0.0',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        // --- STATE ---
        tab: 'warroom', loading: true, searchQuery: '',
        alliances: [], processedAlliances: [], 
        openGroups: [], strikePlan: {},
        displayClock: '', currentRoundText: '', currentPhase: '', phaseCountdown: '',
        week: 1, seasonStart: new Date("2026-01-05T03:00:00+01:00"), 
        
        // --- SIMULATION / PLANNER STATE ---
        planner: [], // Array of { kageId, targetId, estStolen }

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            await this.fetchData();
            setInterval(() => { this.updateClockOnly(); this.refreshStashMath(); }, 1000);
            
            // Initialize planner with top 20 Kage
            const topKage = this.getGroupedFaction('Kage').flatMap(g => g.alliances).slice(0, 20);
            this.planner = topKage.map(a => ({ 
                kage: a, 
                targetId: '', 
                estStolen: Math.floor(a.warStash * 0.15) // placeholder, actual plunder depends on target
            }));
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

        // --- MATCHMAKING LOGIC ---
        // Returns Koubu alliances in the same Rank Group
        getPossibleTargets(kageAlliance) {
            const kGroups = this.getGroupedFaction('Kage');
            const qGroups = this.getGroupedFaction('Koubu');
            const myGroupId = kGroups.find(g => g.alliances.some(a => a.id === kageAlliance.id))?.id;
            // Dossier Rule: Can only hit those in the exact same Rank Group
            return qGroups.find(g => g.id === myGroupId)?.alliances || [];
        },

        updateEstStolen(index) {
            const plan = this.planner[index];
            const target = this.alliances.find(a => a.id === plan.targetId);
            if (target) {
                // Logic: Stolen amount is based on Target's War Stash (15% cap)
                // We use the processed version to get calculated warStash
                const processedTarget = this.processedAlliances.find(pa => pa.id === target.id);
                plan.estStolen = Math.floor(processedTarget.warStash * 0.15);
            }
        },

        getTotalStolen() {
            return this.planner.reduce((sum, p) => sum + (Number(p.estStolen) || 0), 0);
        },

        // --- CORE MATH ---
        getGroupedFaction(fName) {
            const sorted = [...this.processedAlliances]
                .filter(a => a.faction === fName)
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
            const groupTime = this.getGroupingStartTime(cet);

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
                    rankingStash: current, // Anchor for sorting
                    rate: rate 
                };
            });
        },

        getNextWarTime() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let t = new Date(cet); t.setHours(15, 30, 0, 0);
            while (true) {
                const day = t.getDay();
                if ((day === 3 || day === 6) && t > cet) return t;
                t.setDate(t.getDate() + 1);
            }
        },

        getGroupingStartTime(base) {
            let t = new Date(base); const d = t.getDay();
            if (d >= 1 && d < 4 && !(d === 4 && t.getHours() >= 3)) t.setDate(t.getDate() + (4 - d));
            else t.setDate(t.getDate() + (d === 0 ? 1 : 8 - d));
            t.setHours(3, 0, 0, 0); return t;
        },

        updateClockOnly() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            this.week = Math.max(1, Math.floor((cet - this.seasonStart) / 864e5 / 7) + 1);
            const dff = this.getNextWarTime() - cet;
            this.phaseCountdown = `${Math.floor(dff/36e5)}h ${Math.floor((dff%36e5)/6e4)}m`;
        },

        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1e9).toFixed(1) + 'B'; }
    }
}
