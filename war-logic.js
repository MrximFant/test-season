window.warRoom = function() {
    return {
        // --- CONFIG ---
        version: '3.0.0',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        // --- STATE ---
        tab: 'warroom', loading: true, searchQuery: '',
        alliances: [], processedAlliances: [], 
        favorites: [], strikePlan: {}, openGroups: [],
        displayClock: '', currentRoundText: '', currentPhase: '', phaseCountdown: '',
        week: 1, seasonStart: new Date("2026-01-05T03:00:00+01:00"), 
        
        // --- SIMULATION STATE ---
        sim: { 
            us: null, them: null, 
            rosterUs: [], rosterThem: [],
            loading: false 
        },

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            const savedFavs = localStorage.getItem('war_favorites');
            if (savedFavs) this.favorites = JSON.parse(savedFavs);
            
            await this.fetchData();
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

        // --- STRIKE CALCULATOR ---
        toggleBuilding(aId, index) {
            if (!this.strikePlan[aId]) this.strikePlan[aId] = [];
            const idx = this.strikePlan[aId].indexOf(index);
            if (idx > -1) this.strikePlan[aId].splice(idx, 1);
            else this.strikePlan[aId].push(index);
        },
        getPlannedPlunder(a) {
            const selected = this.strikePlan[a.id] || [];
            if (selected.length === 0) return a.warStash * 0.15;
            let totalPercent = 0;
            selected.forEach(i => { totalPercent += (i === 3 ? 0.06 : 0.03); });
            return a.warStash * totalPercent;
        },

        // --- STRATEGIC SIMULATION ---
        async loadSimulation() {
            if (!this.sim.us || !this.sim.them) return;
            this.sim.loading = true;
            try {
                const { data } = await this.client.from('players')
                    .select('*')
                    .in('alliance_id', [this.sim.us.id, this.sim.them.id])
                    .order('thp', { ascending: false });
                
                this.sim.rosterUs = data.filter(p => p.alliance_id === this.sim.us.id).slice(0, 6);
                this.sim.rosterThem = data.filter(p => p.alliance_id === this.sim.them.id).slice(0, 6);
            } catch (e) { console.error(e); }
            this.sim.loading = false;
        },

        // --- GROUPING LOGIC ---
        getGroupedFaction(fName) {
            const sorted = this.processedAlliances
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

        // --- TIME ENGINE ---
        refreshStashMath() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const warTime = this.getNextWarTime();
            const groupTime = this.getGroupingStartTime(cet);

            this.processedAlliances = this.alliances.map(a => {
                let rate = Number(a.city_rate) > 0 ? Number(a.city_rate) : Number(a.observed_rate || 0);
                const sTime = new Date(a.last_scout_time);
                const hrsSince = Math.max(0, (cet - sTime) / 3600000);
                const current = Number(a.last_copper || 0) + (rate * hrsSince);
                return { 
                    ...a, 
                    stash: current, 
                    warStash: current + (rate * (Math.max(0, (warTime - cet) / 3600000))),
                    groupStash: current + (rate * (Math.max(0, (groupTime - cet) / 3600000))),
                    rankingStash: current, // simplified for load
                    rate: rate 
                };
            });
        },

        getGroupingStartTime(base) {
            let t = new Date(base); const d = t.getDay();
            if (d >= 1 && d < 4 && !(d === 4 && t.getHours() >= 3)) t.setDate(t.getDate() + (4 - d));
            else t.setDate(t.getDate() + (d === 0 ? 1 : 8 - d));
            t.setHours(3, 0, 0, 0); return t;
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

        updateClockOnly() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            this.week = Math.max(1, Math.floor((cet - this.seasonStart) / 864e5 / 7) + 1);
            const dff = this.getNextWarTime() - cet;
            this.phaseCountdown = `${Math.floor(dff/36e5)}h ${Math.floor((dff%36e5)/6e4)}m`;
        },

        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1e9).toFixed(1) + 'B'; },
        matchesSearch(a) { 
            const q = this.searchQuery.toLowerCase();
            return !q || a.name.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q); 
        }
    }
}
