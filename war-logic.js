window.warRoom = function() {
    return {
        // --- 1. CONFIG ---
        // PLEASE DOUBLE CHECK THIS KEY IN SUPABASE SETTINGS > API (Starts with eyJ...)
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48', 

        // --- 2. STATE ---
        tab: 'warroom', loading: true, mobileMenu: false, searchQuery: '', refSearch: '', debugStatus: 'Ready',
        week: 1, currentPhase: '', phaseAction: '', phaseCountdown: '', currentRoundText: '',
        alliances: [], players: [], history: [], cities: [], openAlliances: [], openServers: [],
        authenticated: false, passInput: '', editTag: '', modifiedTags: [], myAllianceName: '', 
        useServerTime: false, displayClock: '',
        seasonStart: new Date("2026/01/05 03:00:00"),

        // --- 3. INIT ---
        async init() {
            try {
                this.client = supabase.createClient(this.sbUrl, this.sbKey);
                this.myAllianceName = localStorage.getItem('war_ref_alliance') || '';
                this.useServerTime = localStorage.getItem('war_time_mode') === 'true';
                await this.fetchData();
                this.updateClock();
                setInterval(() => this.updateClock(), 1000);
            } catch (e) {
                this.debugStatus = "Init Failed: Check Keys";
            }
        },

        saveSettings() {
            localStorage.setItem('war_ref_alliance', this.myAllianceName);
            localStorage.setItem('war_time_mode', this.useServerTime);
        },

        // --- 4. DATA SYNC ---
        async fetchData() {
            this.loading = true;
            try {
                const [a, p, c, h] = await Promise.all([
                    this.client.from('alliances').select('*'),
                    this.client.from('elite_forces_view').select('*'),
                    this.client.from('cities').select('*'),
                    this.client.from('history').select('*').order('timestamp', { ascending: false })
                ]);
                this.alliances = a.data || [];
                this.players = (p.data || []).map(r => ({ 
                    tag: r.tag, 
                    name: r.player_name, 
                    thp: Number(r.player_thp) || 0, 
                    faction: r.faction, 
                    server: r.server 
                }));
                this.cities = c.data || [];
                this.history = h.data || [];
                this.debugStatus = `DB Link: ${this.alliances.length} Alliances`;
            } catch (e) { 
                this.debugStatus = "Supabase Fetch Failed";
                console.error(e);
            }
            this.loading = false;
        },

        // --- 5. TACTICAL MATH ---
        getObservedRate(tag) {
            if (!tag) return 0;
            const snps = this.history.filter(x => x.tag && x.tag.toLowerCase() === tag.toLowerCase());
            if (snps.length < 2) return 0;
            const cDiff = Number(snps[0].copper) - Number(snps[1].copper); // Matches 'copper' column
            const hDiff = (new Date(snps[0].timestamp) - new Date(snps[1].timestamp)) / 3600000;
            return hDiff > 0.01 ? Math.round((cDiff / hDiff) / 100) * 100 : 0;
        },

        get factionData() {
            const nextWar = this.getNextWarTime();
            const now = new Date();
            return this.alliances.map(a => {
                const snps = this.history.filter(x => x.tag && x.tag.toLowerCase() === a.tag.toLowerCase());
                const lastEntry = snps[0] || { copper: 0, timestamp: now };
                const rate = this.getObservedRate(a.tag);
                const hoursSince = Math.max(0, (now - new Date(lastEntry.timestamp)) / 3600000);
                const hoursTillWar = Math.max(0, (nextWar - now) / 3600000);
                return { 
                    ...a, 
                    stash: Number(lastEntry.copper) + (rate * hoursSince), 
                    warStash: Number(lastEntry.copper) + (rate * (hoursSince + hoursTillWar)), 
                    rate: rate 
                };
            });
        },

        // --- 6. UI HELPERS ---
        getGroupedFaction(fName) {
            const sorted = this.factionData.filter(a => a.faction && a.faction.includes(fName)).sort((a,b) => b.stash - a.stash);
            const groups = []; const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            let i = 0;
            while (i < 30 && i < sorted.length) {
                groups.push({ id: Math.floor(i/step)+1, label: `Rank ${i+1}-${Math.min(i+step, 30)}`, alliances: sorted.slice(i, i+step).map((it, idx) => ({ ...it, factionRank: i+idx+1 })) });
                i += step;
            }
            if (sorted.length > 30) groups.push({ id: groups.length + 1, label: "Rank 31-100", alliances: sorted.slice(30, 100).map((it, idx) => ({ ...it, factionRank: 31+idx })) });
            return groups;
        },

        get groupedForces() {
            if (this.tab !== 'forces') return {};
            const groups = {};
            this.alliances.forEach(a => {
                const aPlayers = this.players.filter(p => p.tag === a.tag).sort((x,y) => y.thp - x.thp);
                const maxTHP = aPlayers.length > 0 ? aPlayers[0].thp : 0;
                const data = this.factionData.find(f => f.tag === a.tag) || { stash:0, rate:0 };
                if (!groups[a.server]) groups[a.server] = [];
                groups[a.server].push({ ...a, maxTHP, stash: data.stash, rate: data.rate, playerRoster: aPlayers });
            });
            Object.keys(groups).forEach(s => groups[s].sort((a,b) => b.maxTHP - a.maxTHP));
            return groups;
        },

        getNextWarTime() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let war = new Date(cet);
            const warDays = [3, 6]; 
            let found = false;
            while (!found) {
                if (warDays.includes(war.getDay())) {
                    war.setHours(15, 30, 0, 0);
                    if (war > cet) { found = true; break; }
                }
                war.setDate(war.getDate() + 1);
                war.setHours(15, 30, 0, 0);
            }
            return war;
        },

        updateClock() {
            const now = new Date();
            const cetTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const serverDate = new Date(cetTime.getTime() - (3 * 60 * 60 * 1000));
            const activeTime = this.useServerTime ? serverDate : cetTime;
            this.displayClock = activeTime.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit', second:'2-digit'});

            if (cetTime < this.seasonStart) {
                this.currentRoundText = "PRE-SEASON";
                this.currentPhase = "Awaiting Combat";
                this.phaseAction = "Copper war starts Jan 5th, 03:00 CET";
                const diff = this.seasonStart - cetTime;
                this.phaseCountdown = `${Math.floor(diff/864e5)}d : ${Math.floor((diff%864e5)/36e5)}h : ${Math.floor((diff%36e5)/6e4)}m`;
                this.week = 1;
            } else {
                const diffDays = Math.floor((cetTime - this.seasonStart) / 864e5);
                this.week = Math.max(1, Math.min(4, Math.floor(diffDays / 7) + 1));
                const day = cetTime.getDay();
                const roundNum = ((this.week - 1) * 2) + ((day >= 1 && day <= 3 && day !== 0) ? 1 : 2);
                this.currentRoundText = `Round ${roundNum}`;
                this.currentPhase = "Season Active";
                const nextWar = this.getNextWarTime();
                const diff = nextWar - cetTime;
                this.phaseCountdown = `${Math.floor(diff/36e5)}h : ${Math.floor((diff%36e5)/6e4)}m : ${Math.floor((diff%6e4)/1e3)}s`;
            }
        },

        get filteredRefList() {
            const list = [...this.alliances].sort((a,b) => (a.name||'').localeCompare(b.name));
            return this.refSearch ? list.filter(a => a.tag && a.tag.toLowerCase().includes(this.refSearch.toLowerCase())) : list;
        },
        isAllyServer(group) { const me = this.alliances.find(a => a.name === this.myAllianceName); return me ? group.some(a => a.faction === me.faction) : true; },
        getPlayersForAlliance(tag) { const a = Object.values(this.groupedForces).flat().find(x => x.tag === tag); return a ? a.playerRoster : []; },
        getPassiveRate(tag) { const c = this.cities.find(x => x.tag && x.tag.toLowerCase() === tag.toLowerCase()); return c ? (Number(c.l1||0)*100)+(Number(c.l2||0)*200)+(Number(c.l3||0)*300)+(Number(c.l4||0)*400)+(Number(c.l5||0)*500)+(Number(c.l6||0)*600) : 0; },
        isMatch(t) { const me = this.alliances.find(a => a.name === this.myAllianceName); if (!me || t.faction === me.faction || t.faction === 'Unassigned') return false; const meG = this.getGroupedFaction(me.faction).find(g => g.alliances.some(x => x.tag === me.tag))?.id; const taG = this.getGroupedFaction(t.faction).find(g => g.alliances.some(x => x.tag === t.tag))?.id; return meG === taG; },
        matchesSearch(a) { const q = this.searchQuery.toLowerCase(); return (a.name||'').toLowerCase().includes(q) || (a.tag||'').toLowerCase().includes(q); },
        toggleAlliance(tag) { this.openAlliances = this.openAlliances.includes(tag) ? this.openAlliances.filter(x => x !== tag) : [...this.openAlliances, tag]; },
        isAllianceOpen(tag) { return this.openAlliances.includes(tag); },
        toggleServerCollapse(s) { this.openServers = this.isServerOpen(s) ? this.openServers.filter(x => x !== s) : [...this.openServers, s]; },
        isServerOpen(s) { return this.openServers.includes(s); },
        get knsTotalStash() { return this.factionData.filter(a => a.faction.includes('Kage')).reduce((s, a) => s + a.stash, 0); },
        get kbtTotalStash() { return this.factionData.filter(a => a.faction.includes('Koubu')).reduce((s, a) => s + a.stash, 0); },
        login() { if (this.passInput === 'KING') this.authenticated = true; },
        getCityCount(n) { const c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); return c ? Number(c['l'+n] || 0) : 0; },
        getTotalCities() { const c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); return c ? [1,2,3,4,5,6].reduce((s, i) => s + Number(c['l'+i] || 0), 0) : 0; },
        updateCity(n, d) { let c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); if (!c) { c = { tag: this.editTag.toLowerCase(), l1:0,l2:0,l3:0,l4:0,l5:0,l6:0 }; this.cities.push(c); } if (d > 0 && this.getTotalCities() >= 6) return alert("Max 6 cities!"); c['l'+n] = Math.max(0, Number(c['l'+n] || 0) + d); if (!this.modifiedTags.includes(this.editTag)) this.modifiedTags.push(this.editTag); },
        exportCities() { const csv = Papa.unparse(this.cities); const b = new Blob([csv],{type:'text/csv'}); const u = window.URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'cities.csv'; a.click(); this.modifiedTags = []; },
        copyScoutPrompt() { navigator.clipboard.writeText("Please provide: [Tag], [Alliance], [Stash], [Time]"); alert("Scout Prompt Copied!"); },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1000000000).toFixed(2) + 'B'; }
    }
}
