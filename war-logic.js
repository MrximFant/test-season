window.warRoom = function() {
    return {
        // --- CONFIG ---
        version: '2.8.0',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        // --- STATE ---
        tab: 'warroom', loading: true, searchQuery: '', refSearch: '',
        alliances: [], processedAlliances: [], players: [], 
        favorites: [], strikePlan: {}, openGroups: [],
        authenticated: false, passInput: '',
        displayClock: '', currentRoundText: '', currentPhase: '', phaseCountdown: '', phaseProgress: 0,
        week: 1, seasonStart: new Date("2026-01-05T03:00:00+01:00"), 
        comparisonTarget: null, myAllianceName: '',

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            this.myAllianceName = localStorage.getItem('war_ref_alliance') || '';
            const savedFavs = localStorage.getItem('war_favorites');
            if (savedFavs) this.favorites = JSON.parse(savedFavs);

            await this.fetchData();
            setInterval(() => { this.updateClockOnly(); this.refreshStashMath(); }, 1000);

            const savedKey = localStorage.getItem('war_admin_key');
            if (savedKey) { this.passInput = savedKey; await this.login(true); }
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

        // --- TREND & RANK ENGINE ---
        refreshStashMath() {
            const now = new Date();
            const cetNow = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const warTime = this.getNextWarTime();
            const nextGroupTime = this.getGroupingStartTime(cetNow);
            const anchorTime = this.getRankingAnchorTime();

            // 1. Calculate base stashes
            let base = this.alliances.map(a => {
                let rate = Number(a.city_rate) > 0 ? Number(a.city_rate) : Number(a.observed_rate || 0);
                const scoutTime = a.last_scout_time ? new Date(a.last_scout_time) : cetNow;
                const hoursSinceScout = Math.max(0, (cetNow - scoutTime) / 3600000);
                const currentStash = Number(a.last_copper || 0) + (rate * hoursSinceScout);
                
                return { 
                    ...a, 
                    stash: currentStash, 
                    warStash: currentStash + (rate * (Math.max(0, (warTime - cetNow) / 3600000))),
                    groupStash: currentStash + (rate * (Math.max(0, (nextGroupTime - cetNow) / 3600000))),
                    rankingStash: currentStash + (rate * (Math.max(0, (anchorTime - cetNow) / 3600000))),
                    rate: rate 
                };
            });

            // 2. Calculate Trends (Rank Comparison)
            ['Kage', 'Koubu'].forEach(f => {
                let factionList = base.filter(x => x.faction.includes(f));
                
                // Current Sort
                factionList.sort((a,b) => b.rankingStash - a.rankingStash);
                factionList.forEach((a, idx) => a.currRank = idx + 1);

                // Future Sort
                factionList.sort((a,b) => b.groupStash - a.groupStash);
                factionList.forEach((a, idx) => {
                    a.predRank = idx + 1;
                    a.trend = a.currRank > a.predRank ? 'up' : (a.currRank < a.predRank ? 'down' : 'stable');
                });
            });

            this.processedAlliances = base;
        },

        // --- STRIKE PLANNER ---
        toggleBuilding(aId, index) {
            if (!this.strikePlan[aId]) this.strikePlan[aId] = [];
            if (this.strikePlan[aId].includes(index)) { this.strikePlan[aId] = this.strikePlan[aId].filter(i => i !== index); }
            else { this.strikePlan[aId].push(index); }
        },
        getPlannedPlunder(a) {
            const selected = this.strikePlan[a.id] || [];
            if (selected.length === 0) return a.warStash * 0.15;
            let totalPercent = 0;
            selected.forEach(i => { totalPercent += (i === 3 ? 0.06 : 0.03); });
            return a.warStash * totalPercent;
        },

        // --- TIME ENGINE ---
        getRankingAnchorTime() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let anchors = [];
            for(let i=0; i<10; i++) {
                let d = new Date(cet); d.setDate(d.getDate() - i);
                let day = d.getDay();
                if (day === 1 || day === 4) anchors.push(new Date(new Date(d).setHours(3,0,0,0))); 
                if (day === 3 || day === 6) anchors.push(new Date(new Date(d).setHours(18,0,0,0)));
            }
            return anchors.filter(a => a <= cet).sort((a,b) => b - a)[0] || this.seasonStart;
        },
        getGroupingStartTime(baseTime) {
            let target = new Date(baseTime);
            const day = target.getDay();
            if (day >= 1 && day < 4 && !(day === 4 && target.getHours() >= 3)) { target.setDate(target.getDate() + (4 - day)); } 
            else { target.setDate(target.getDate() + (day === 0 ? 1 : 8 - day)); }
            target.setHours(3, 0, 0, 0); return target;
        },
        getNextWarTime() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let target = new Date(cet);
            target.setHours(15, 30, 0, 0);
            while (true) {
                const day = target.getDay();
                if ((day === 3 || day === 6) && target > cet) return target;
                target.setDate(target.getDate() + 1);
            }
        },
        updateClockOnly() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            const diffDays = Math.floor((cet - this.seasonStart) / 864e5);
            this.week = Math.max(1, Math.floor(diffDays / 7) + 1);
            this.currentRoundText = `WEEK ${this.week}`;
            
            const nextWar = this.getNextWarTime();
            const dff = nextWar - cet;
            this.phaseCountdown = `${Math.floor(dff/36e5)}h ${Math.floor((dff%36e5)/6e4)}m`;
            this.phaseProgress = Math.max(5, 100 - (dff / (72 * 3600000) * 100)); // Visual bar
        },

        // --- UI HELPERS ---
        getGroupedFaction(fName) {
            if (!fName || !this.processedAlliances.length) return [];
            const sorted = this.processedAlliances
                .filter(a => (a.faction || '').toLowerCase().includes(fName.toLowerCase()))
                .sort((a,b) => a.currRank - b.currRank);

            const groups = [];
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            let i = 0;
            while (i < 30 && i < sorted.length) {
                groups.push({ id: Math.floor(i/step)+1, label: `Rank ${i+1}-${Math.min(i+step, 30)}`, alliances: sorted.slice(i, i+step) });
                i += step;
            }
            if (sorted.length > 30) { groups.push({ id: 99, label: "Rank 31-100", alliances: sorted.slice(30, 100) }); }
            return groups;
        },
        isMatch(target) {
            if (!this.myAllianceName) return false;
            const me = this.processedAlliances.find(a => a.name === this.myAllianceName);
            if (!me || target.faction === me.faction) return false;
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            const myG = Math.ceil(me.currRank / step);
            const taG = Math.ceil(target.currRank / step);
            return myG === taG && myG <= 30/step;
        },
        toggleGroup(f, id) { const key = `${f}-${id}`; this.openGroups = this.openGroups.includes(key) ? this.openGroups.filter(k => k !== key) : [...this.openGroups, key]; },
        isFavorite(a) { return this.favorites.some(f => f.id === a.id); },
        toggleFavorite(a) {
            if (this.isFavorite(a)) { this.favorites = this.favorites.filter(f => f.id !== a.id); }
            else { this.favorites.push(a); }
            localStorage.setItem('war_favorites', JSON.stringify(this.favorites));
        },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1e9).toFixed(1) + 'B'; },
        matchesSearch(a) { 
            const q = this.searchQuery.toLowerCase();
            return !q || a.name.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q); 
        },
        setReferenceAlliance(name) { this.myAllianceName = name; localStorage.setItem('war_ref_alliance', name); this.refSearch = ''; }
    }
}
