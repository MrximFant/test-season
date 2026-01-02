/**
 * War Intelligence Command - Core Logic v21.2
 * Relational Supabase Integration + Strategic War Projections
 */

window.warRoom = function() {
    return {
        // --- 1. CONFIGURATION ---
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'sb_publishable_8Swii_HscaDpfTXBnIZ6DQ_IO2xM-tZ',

        // --- 2. GLOBAL STATE ---
        tab: 'warroom', 
        loading: true, 
        mobileMenu: false, 
        searchQuery: '', 
        refSearch: '', 
        debugStatus: 'Initializing...',
        week: 1, 
        currentPhase: '', 
        phaseAction: '', 
        phaseCountdown: '', 
        currentRoundText: '',
        alliances: [], 
        players: [], 
        history: [], 
        cities: [], 
        openAlliances: [], 
        openServers: [],
        authenticated: false, 
        passInput: '', 
        editTag: '', 
        modifiedTags: [], 
        myAllianceName: '', 
        useServerTime: false, 
        displayClock: '',

        // FIXED SEASON ANCHOR: Monday, Jan 5, 2026, 03:00 CET
        seasonStart: new Date("2026-01-05T03:00:00+01:00"),

        // --- 3. INITIALIZATION ---
        async init() {
            // Initialize Supabase Client
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            
            // Load persistent settings from device memory
            this.myAllianceName = localStorage.getItem('war_ref_alliance') || '';
            this.useServerTime = localStorage.getItem('war_time_mode') === 'true';
            
            await this.fetchData();
            this.updateClock();
            
            // Start tactical background loops
            setInterval(() => this.updateClock(), 1000);
        },

        saveSettings() {
            localStorage.setItem('war_ref_alliance', this.myAllianceName);
            localStorage.setItem('war_time_mode', this.useServerTime);
        },

        // --- 4. CLOCK & STRATEGIC PROJECTION ---
        getNextWarTime() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let war = new Date(cet);
            const warDays = [3, 6]; // Wednesday and Saturday
            let found = false;
            let safety = 0;
            while (!found && safety < 14) {
                if (warDays.includes(war.getDay())) {
                    war.setHours(15, 30, 0, 0); // 15:30 CET Start
                    if (war > cet) { found = true; break; }
                }
                war.setDate(war.getDate() + 1);
                war.setHours(15, 30, 0, 0);
                safety++;
            }
            return war;
        },

        updateClock() {
            const now = new Date();
            const cetTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const serverDate = new Date(cetTime.getTime() - (3 * 60 * 60 * 1000));
            const activeTime = this.useServerTime ? serverDate : cetTime;
            
            this.displayClock = activeTime.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit', second:'2-digit'}) + (this.useServerTime ? ' [SRV]' : ' [CET]');

            if (cetTime < this.seasonStart) {
                // PRE-SEASON MODE
                this.currentRoundText = "PRE-SEASON";
                this.currentPhase = "Awaiting Combat";
                this.phaseAction = "Copper war starts Jan 5th, 03:00 CET";
                const diff = this.seasonStart - cetTime;
                const dRem = Math.floor(diff / 86400000);
                const hRem = Math.floor((diff % 86400000) / 3600000);
                const mRem = Math.floor((diff % 3600000) / 60000);
                this.phaseCountdown = `${dRem}d : ${hRem}h : ${mRem}m`;
                this.week = 1;
            } else {
                // ACTIVE SEASON MODE
                const diffMs = cetTime - this.seasonStart;
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                this.week = Math.max(1, Math.min(4, Math.floor(diffDays / 7) + 1));
                
                const day = cetTime.getDay();
                const hr = cetTime.getHours();
                const roundNum = ((this.week - 1) * 2) + ((day >= 1 && day <= 3 && day !== 0) ? 1 : 2);
                this.currentRoundText = `Round ${roundNum} (W${this.week})`;

                // Battlefield Phases
                if (day === 1 || day === 4) { this.currentPhase = "Grouping Phase"; this.phaseAction = "Review rankings. Declaration opens tomorrow."; }
                else if (day === 2 || day === 5) { this.currentPhase = "Declaration Stage"; this.phaseAction = "R4+ declare war on enemies in same group."; }
                else if (day === 3 || day === 6) { 
                    if (hr < 12) { this.currentPhase = "Invitation Stage"; this.phaseAction = "Defenders invite allies to assist."; }
                    else if (hr < 12.5) { this.currentPhase = "Preparation Stage"; this.phaseAction = "Missiles and Tesla window (30m)."; }
                    else if (hr < 13.2) { this.currentPhase = "WAR ACTIVE"; this.phaseAction = "Kill WH first (3% ea) -> Center (6%)"; }
                    else { this.currentPhase = "Cooling Down"; this.phaseAction = "Analyzing plunder results."; }
                } else { this.currentPhase = "Rest Phase"; this.phaseAction = "Planning for next round."; }

                const nextWar = this.getNextWarTime();
                const dff = nextWar - cetTime;
                this.phaseCountdown = `${Math.floor(dff/3600000)}h : ${Math.floor((dff%3600000)/60000)}m : ${Math.floor((dff%60000)/1000)}s`;
            }
        },

        // --- 5. DATA SYNC ---
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
                // Bound Player Logic
                this.players = (p.data || []).map(r => ({ 
                    tag: r.tag, 
                    name: r.player_name, 
                    thp: Number(r.player_thp) || 0, 
                    faction: r.faction, 
                    server: r.server 
                }));
                this.cities = c.data || [];
                this.history = h.data || [];
                this.debugStatus = `OK: ${this.alliances.length} Alliances`;
            } catch (e) { this.debugStatus = "Supabase Sync Error"; }
            this.loading = false;
        },

        // --- 6. COPPER & PLUNDER MATH ---
        getObservedRate(tag) {
            const snps = this.history.filter(x => (x.tag||'').toLowerCase() === tag.toLowerCase());
            if (snps.length < 2) return 0;
            const cDiff = Number(snps[0].copper) - Number(snps[1].copper);
            const hDiff = (new Date(snps[0].timestamp) - new Date(snps[1].timestamp)) / 3600000;
            // Snap to nearest 100
            return hDiff > 0.05 ? Math.round((cDiff / hDiff) / 100) * 100 : 0;
        },

        get factionData() {
            const nextWar = this.getNextWarTime();
            const now = new Date();
            return this.alliances.map(a => {
                const snps = this.history.filter(x => (x.tag||'').toLowerCase() === a.tag.toLowerCase());
                const last = snps[0] || { copper: 0, timestamp: now };
                const rate = this.getObservedRate(a.tag);
                
                const hoursSinceScout = (now - new Date(last.timestamp)) / 3600000;
                const hoursTillWar = (nextWar - now) / 3600000;

                return { 
                    ...a, 
                    stash: Number(last.copper) + (rate * hoursSinceScout), 
                    warStash: Number(last.copper) + (rate * (hoursSinceScout + hoursTillWar)), 
                    rate: rate 
                };
            });
        },

        // --- 7. TACTICAL UI GETTERS ---
        getGroupedFaction(fName) {
            const sorted = this.factionData.filter(a => a.faction === fName).sort((a,b) => b.stash - a.stash);
            const groups = []; 
            // Weekly Step Sizes
            let step = 10; let catchAll = 30;
            if (this.week === 2) step = 6;
            if (this.week >= 3) step = 3;

            let i = 0;
            while (i < catchAll && i < sorted.length) {
                groups.push({ 
                    id: Math.floor(i/step)+1, 
                    label: `Rank ${i+1}-${Math.min(i+step, catchAll)}`, 
                    alliances: sorted.slice(i, i+step).map((it, idx) => ({ ...it, factionRank: i+idx+1 })) 
                });
                i += step;
            }
            if (sorted.length > catchAll) {
                groups.push({ 
                    id: groups.length + 1, 
                    label: `Rank ${catchAll+1}-100`, 
                    alliances: sorted.slice(catchAll, 100).map((it, idx) => ({ ...it, factionRank: catchAll+idx+1 })) 
                });
            }
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

        get filteredRefList() {
            const list = [...this.alliances].sort((a,b) => (a.name||'').localeCompare(b.name));
            return this.refSearch ? list.filter(a => (a.tag||'').toLowerCase().includes(this.refSearch.toLowerCase())) : list;
        },

        isAllyServer(group) {
            const me = this.alliances.find(a => a.name === this.myAllianceName);
            return me ? group.some(a => a.faction === me.faction) : true;
        },

        isMatch(t) {
            const me = this.alliances.find(a => a.name === this.myAllianceName);
            if (!me || t.faction === me.faction || t.faction === 'Unassigned') return false;
            const myG = this.getGroupedFaction(me.faction).find(g => g.alliances.some(x => x.tag === me.tag))?.id;
            const taG = this.getGroupedFaction(t.faction).find(g => g.alliances.some(x => x.tag === t.tag))?.id;
            return myG === taG;
        },

        // --- 8. UTILITIES ---
        getPlayersForAlliance(tag) { const a = Object.values(this.groupedForces).flat().find(x => x.tag === tag); return a ? a.playerRoster : []; },
        getPassiveRate(tag) { const c = this.cities.find(x => (x.tag||'').toLowerCase() === tag.toLowerCase()); return c ? (Number(c.l1||0)*100)+(Number(c.l2||0)*200)+(Number(c.l3||0)*300)+(Number(c.l4||0)*400)+(Number(c.l5||0)*500)+(Number(c.l6||0)*600) : 0; },
        matchesSearch(a) { const q = this.searchQuery.toLowerCase(); return (a.name||'').toLowerCase().includes(q) || (a.tag||'').toLowerCase().includes(q); },
        toggleAlliance(tag) { this.openAlliances = this.isAllianceOpen(tag) ? this.openAlliances.filter(x => x !== tag) : [...this.openAlliances, tag]; },
        isAllianceOpen(tag) { return this.openAlliances.includes(tag); },
        toggleServerCollapse(s) { this.openServers = this.isServerOpen(s) ? this.openServers.filter(x => x !== s) : [...this.openServers, s]; },
        isServerOpen(s) { return this.openServers.includes(s); },
        login() { if (this.passInput === 'KING') this.authenticated = true; },
        getCityCount(n) { const c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); return c ? Number(c['l'+n] || 0) : 0; },
        getTotalCities() { const c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); return c ? [1,2,3,4,5,6].reduce((s, i) => s + Number(c['l'+i] || 0), 0) : 0; },
        updateCity(n, d) { let c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); if (!c) { c = { tag: this.editTag.toLowerCase(), l1:0,l2:0,l3:0,l4:0,l5:0,l6:0 }; this.cities.push(c); } if (d > 0 && this.getTotalCities() >= 6) return alert("Max 6 cities!"); c['l'+n] = Math.max(0, Number(c['l'+n] || 0) + d); if (!this.modifiedTags.includes(this.editTag)) this.modifiedTags.push(this.editTag); },
        exportCities() { const csv = Papa.unparse(this.cities); const b = new Blob([csv],{type:'text/csv'}); const u = window.URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'cities.csv'; a.click(); this.modifiedTags = []; },
        copyScoutPrompt() { navigator.clipboard.writeText("Please provide: [Tag], [Alliance], [Stash], [Time]"); alert("Scout Prompt Copied!"); },
        get knsTotalStash() { return this.factionData.filter(a => a.faction.includes('Kage')).reduce((s, a) => s + a.stash, 0); },
        get kbtTotalStash() { return this.factionData.filter(a => a.faction.includes('Koubu')).reduce((s, a) => s + a.stash, 0); },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1000000000).toFixed(2) + 'B'; }
    }
}
