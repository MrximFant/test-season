window.warRoom = function() {
    return {
        // --- CONFIG ---
        version: '2.6.0',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        // --- STATE ---
        tab: 'warroom', loading: true, searchQuery: '', refSearch: '',
        alliances: [], processedAlliances: [], players: [], 
        favorites: [], 
        strikePlan: {}, // Stores selected building indices per allianceId
        openGroups: [], authenticated: false, passInput: '',
        displayClock: '', currentRoundText: '', currentPhase: '', phaseCountdown: '',
        week: 1, seasonStart: new Date("2026-01-05T03:00:00+01:00"), 
        comparisonTarget: null,

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            this.myAllianceName = localStorage.getItem('war_ref_alliance') || '';
            
            // Load Favorites
            const savedFavs = localStorage.getItem('war_favorites');
            if (savedFavs) this.favorites = JSON.parse(savedFavs);

            await this.fetchData();
            
            // Start Intervals
            setInterval(() => { this.updateClockOnly(); this.refreshStashMath(); }, 1000);

            const savedKey = localStorage.getItem('war_admin_key');
            if (savedKey) { this.passInput = savedKey; await this.login(true); }
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

        // --- STRIKE PLANNER MATH ---
        // Indices: 0, 1, 2 = Warehouses (3%), 3 = Center (6%)
        toggleBuilding(aId, index) {
            if (!this.strikePlan[aId]) this.strikePlan[aId] = [];
            if (this.strikePlan[aId].includes(index)) {
                this.strikePlan[aId] = this.strikePlan[aId].filter(i => i !== index);
            } else {
                this.strikePlan[aId].push(index);
            }
        },

        getPlannedPlunder(a) {
            const selected = this.strikePlan[a.id] || [];
            if (selected.length === 0) return a.warStash * 0.15; // Default to Max Cap
            let totalPercent = 0;
            selected.forEach(i => { totalPercent += (i === 3 ? 0.06 : 0.03); });
            return a.warStash * totalPercent;
        },

        // --- FAVORITES (STARS) ---
        isFavorite(a) { return this.favorites.some(f => f.id === a.id); },
        toggleFavorite(a) {
            if (this.isFavorite(a)) {
                this.favorites = this.favorites.filter(f => f.id !== a.id);
            } else {
                this.favorites.push(a);
            }
            localStorage.setItem('war_favorites', JSON.stringify(this.favorites));
        },

        // --- STASH CALCULATIONS ---
        refreshStashMath() {
            const now = new Date();
            const cetNow = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const warTime = this.getNextWarTime();
            const nextGroupTime = this.getGroupingStartTime(cetNow);

            this.processedAlliances = this.alliances.map(a => {
                let rate = Number(a.city_rate) > 0 ? Number(a.city_rate) : Number(a.observed_rate || 0);
                const scoutTime = a.last_scout_time ? new Date(a.last_scout_time) : cetNow;
                const hoursSinceScout = Math.max(0, (cetNow - scoutTime) / 3600000);
                const hoursUntilWar = Math.max(0, (warTime - cetNow) / 3600000);
                
                const currentStash = Number(a.last_copper || 0) + (rate * hoursSinceScout);
                return { 
                    ...a, 
                    stash: currentStash, 
                    warStash: currentStash + (rate * hoursUntilWar),
                    groupStash: currentStash + (rate * (Math.max(0, (nextGroupTime - cetNow) / 3600000))),
                    rate: rate 
                };
            });
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

        // --- UI HELPERS ---
        updateClockOnly() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            const diffDays = Math.floor((cet - this.seasonStart) / 864e5);
            this.week = Math.max(1, Math.floor(diffDays / 7) + 1);
            this.currentRoundText = `WEEK ${this.week}`;
            this.currentPhase = "STRIKE READY";
            const dff = this.getNextWarTime() - cet;
            this.phaseCountdown = `${Math.floor(dff/36e5)}h ${Math.floor((dff%36e5)/6e4)}m ${Math.floor((dff%6e4)/1000)}s`;
        },

        async openComparison(targetAlliance) {
            const me = this.alliances.find(a => a.name === this.myAllianceName);
            if (!me) return alert("Select your Alliance in sidebar first.");
            const { data } = await this.client.from('players').select('*').in('alliance_id', [me.id, targetAlliance.id]).order('thp', { ascending: false });
            this.comparisonTarget = {
                me: { name: me.name, tag: me.tag, roster: data.filter(p => p.alliance_id === me.id) },
                them: { name: targetAlliance.name, tag: targetAlliance.tag, roster: data.filter(p => p.alliance_id === targetAlliance.id) }
            };
        },

        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1e9).toFixed(1) + 'B'; },
        matchesSearch(a) { 
            const q = this.searchQuery.toLowerCase();
            return !q || a.name.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q); 
        },
        async login() {
            const { data } = await this.client.from('authorized_managers').select('manager_name').eq('secret_key', this.passInput).single();
            if (data) { this.authenticated = true; localStorage.setItem('war_admin_key', this.passInput); }
        },
        async processImport() {
            this.isImporting = true;
            try {
                const cleanData = JSON.parse(this.importData); 
                let count = 0;
                for (const item of cleanData) {
                    const alliance = this.alliances.find(a => a.tag.toLowerCase() === item.tag.toLowerCase());
                    if (alliance) { await this.client.from('history').insert({ alliance_id: alliance.id, copper: item.stash }); count++; }
                }
                alert(`Processed ${count} scouts.`); this.importData = '';
            } catch (e) { alert("JSON Format Error"); }
            this.isImporting = false; await this.fetchData();
        }
    }
}
