window.warRoom = function() {
    return {
        // --- 1. GLOBAL STATE ---
        tab: 'warroom', loading: true, mobileMenu: false, searchQuery: '', refSearch: '', debugStatus: 'Ready',
        week: 1, currentPhase: '', phaseAction: '', phaseCountdown: '', currentRoundText: '',
        alliances: [], players: [], history: [], cities: [], openAlliances: [], openServers: [],
        authenticated: false, passInput: '', editTag: '', modifiedTags: [], myAllianceName: '', 
        useServerTime: false, displayClock: '',

        // FIXED SEASON ANCHOR: Monday, Jan 5, 2026, 03:00 CET
        seasonStart: new Date("2026/01/05 03:00:00"),

        // --- 2. INITIALIZATION ---
        init() {
            this.myAllianceName = localStorage.getItem('war_ref_alliance') || '';
            this.useServerTime = localStorage.getItem('war_time_mode') === 'true';
            this.fetchData();
            this.updateClock();
            setInterval(() => this.updateClock(), 1000);
        },

        saveSettings() {
            localStorage.setItem('war_ref_alliance', this.myAllianceName);
            localStorage.setItem('war_time_mode', this.useServerTime);
        },

        // --- 3. CALENDAR & PROJECTION MATH ---
        getNextWarTime() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let war = new Date(cet);
            // War starts Wednesday (3) or Saturday (6) at 15:00 CET
            const warDays = [3, 6];
            let found = false;
            let safety = 0;
            while (!found && safety < 10) {
                if (warDays.includes(war.getDay())) {
                    war.setHours(15, 0, 0, 0);
                    if (war > cet) { found = true; break; }
                }
                war.setDate(war.getDate() + 1);
                war.setHours(15, 0, 0, 0);
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
                this.currentRoundText = "PRE-SEASON";
                this.currentPhase = "Awaiting Combat";
                this.phaseAction = "Copper war starts Jan 5th, 03:00 CET";
                const diff = this.seasonStart - cetTime;
                this.phaseCountdown = `${Math.floor(diff/864e5)}d : ${Math.floor((diff%864e5)/36e5)}h : ${Math.floor((diff%36e5)/6e4)}m`;
            } else {
                const diffDays = Math.floor((cetTime - this.seasonStart) / 864e5);
                this.week = Math.max(1, Math.min(4, Math.floor(diffDays / 7) + 1));
                const day = cetTime.getDay();
                const hr = cetTime.getHours();
                const roundNum = ((this.week - 1) * 2) + ((day >= 1 && day <= 3) ? 1 : 2);
                this.currentRoundText = `Round ${roundNum}`;

                let ms = [
                    {d:1,h:3,n:'Grouping Phase',a:'Brackets forming.'},
                    {d:2,h:3,n:'Declaration Window',a:'R4+ Declare War!'},
                    {d:3,h:3,n:'Invitation Phase',a:'Invite defense allies.'},
                    {d:3,h:12,n:'Preparation',a:'Missile window.'},
                    {d:3,h:12.5,n:'WAR ACTIVE',a:'WH -> Center'},
                    {d:4,h:3,n:'Grouping Phase',a:'Round 2 brackets.'},
                    {d:5,h:3,n:'Declaration Window',a:'R4+ Declare War!'},
                    {d:6,h:3,n:'Invitation Phase',a:'Invite defense allies.'},
                    {d:6,h:12,n:'Preparation',a:'Missile window.'},
                    {d:6,h:12.5,n:'WAR ACTIVE',a:'WH -> Center'},
                    {d:0,h:3,n:'Rest Phase',a:'Results analysis.'}
                ];
                let next = ms.find(m => (day < m.d) || (day === m.d && hr < m.h)) || ms[0];
                const curr = [...ms].reverse().find(m => (day > m.d) || (day === m.d && hr >= m.h)) || ms[ms.length-1];
                this.currentPhase = curr.n; this.phaseAction = curr.a;
                let target = new Date(cetTime);
                target.setDate(target.getDate() + (next.d - day + (next.d < day || (next.d === day && next.h <= hr) ? 7 : 0)));
                target.setHours(next.h, 0, 0, 0);
                const dff = target - cetTime;
                this.phaseCountdown = `${Math.floor(dff/36e5)}h : ${Math.floor((dff%36e5)/6e4)}m : ${Math.floor((dff%6e4)/1e3)}s`;
            }
        },

        // --- 4. DATA SYNC ---
        async fetchData() {
            this.loading = true;
            const cb = `&t=${Date.now()}`;
            const base = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFfdDzrMXgqdjSZrSI4YcbDvFoYlrri87EEhG2I9aecW2xcuuLFcl-sxEVjvY1LTdPkXjKSzlwoNQd/pub?output=csv&gid=';
            const scrub = (d) => d.map(r => { let c = {}; Object.keys(r).forEach(k => c[k.trim().toLowerCase().replace(/\s+/g,'')] = r[k] ? String(r[k]).trim() : ''); return c; });
            const fetchCSV = async (gid) => { try { const r = await fetch(base + gid + cb); const t = await r.text(); return scrub(Papa.parse(t, {header:true, skipEmptyLines:true}).data); } catch (e) { return []; } };
            const [rawA, rawP, rawC, rawH] = await Promise.all([fetchCSV('0'), fetchCSV('1007829300'), fetchCSV('1860064624'), fetchCSV('1091133615')]);
            const mapF = (f) => { if (!f) return 'Unassigned'; const l = f.toLowerCase(); if (l.includes('kage') || l.includes('red')) return 'Kage no Sato'; if (l.includes('koubu') || l.includes('blue')) return 'Koubutai'; return 'Unassigned'; };
            
            this.alliances = rawA.map(r => ({ faction: mapF(r.faction), server: r.server, tag: r.tag, name: r.alliancename, power: Number((r.totalpower||'').replace(/\D/g,'')) || 0 })).filter(r => r.tag);
            this.players = rawP.map(r => ({ tag: r.tag, name: r.playername, thp: Number((r.thp||'').replace(/\D/g,'')) || 0 })).filter(r => r.name);
            this.cities = rawC; this.history = rawH;
            this.loading = false;
            this.debugStatus = `OK: ${this.alliances.length} Alliances`;
        },

        // --- 5. TACTICAL GETTERS ---
        getObservedRate(tag) {
            const snps = this.history.filter(x => (x.tag||'').toLowerCase() === tag.toLowerCase()).map(x => ({ ...x, dObj: new Date(x.timestamp.replace(/-/g, "/")) })).sort((a,b) => b.dObj - a.dObj);
            if (snps.length < 2) return 0;
            const cDiff = Number(snps[0].totalcopper.replace(/\D/g,'')) - Number(snps[1].totalcopper.replace(/\D/g,''));
            const hDiff = (snps[0].dObj - snps[1].dObj) / 3600000;
            const rawRate = hDiff > 0.05 ? (cDiff / hDiff) : 0;
            return Math.round(rawRate / 100) * 100; // Snap to 100s
        },

        get factionData() {
            const now = new Date();
            const nextWar = this.getNextWarTime();
            return this.alliances.map(a => {
                const snps = this.history.filter(x => (x.tag||'').toLowerCase() === a.tag.toLowerCase()).map(x => ({ ...x, dObj: new Date(x.timestamp.replace(/-/g, "/")) })).sort((a,b) => b.dObj - a.dObj);
                const lastEntry = snps[0];
                const baseStash = lastEntry ? Number(lastEntry.totalcopper.replace(/\D/g,'')) : 0;
                const lastTime = lastEntry ? lastEntry.dObj : now;
                const rate = this.getObservedRate(a.tag);
                
                const hoursSinceScout = (now - lastTime) / 3600000;
                const hoursUntilWar = (nextWar - now) / 3600000;

                return { 
                    ...a, 
                    stash: baseStash + (rate * hoursSinceScout), 
                    warStash: baseStash + (rate * (hoursSinceScout + hoursUntilWar)),
                    rate: rate 
                };
            });
        },

        get groupedForces() {
            if (this.tab !== 'forces') return {}; // PERFORMANCE OPTIMIZATION
            const groups = {};
            this.alliances.forEach(a => {
                const pList = this.getPlayersForAlliance(a.tag);
                const maxTHP = pList.length > 0 ? pList[0].thp : 0;
                const data = this.factionData.find(f => f.tag === a.tag) || { stash:0, rate:0 };
                if (!groups[a.server]) groups[a.server] = [];
                groups[a.server].push({ ...a, maxTHP, stash: data.stash, rate: data.rate });
            });
            Object.keys(groups).forEach(s => groups[s].sort((a,b) => b.maxTHP - a.maxTHP));
            return groups;
        },

        get knsGroups() { return this.getGroupedFaction('Kage no Sato'); },
        get kbtGroups() { return this.getGroupedFaction('Koubutai'); },

        getGroupedFaction(fName) {
            const sorted = this.factionData.filter(a => a.faction === fName).sort((a,b) => b.stash - a.stash);
            const groups = [];
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            let i = 0;
            while (i < 30 && i < sorted.length) {
                groups.push({ id: Math.floor(i/step)+1, label: `Rank ${i+1}-${Math.min(i+step, 30)}`, alliances: sorted.slice(i, i+step) });
                i += step;
            }
            if (sorted.length > 30) groups.push({ id: (this.week===1?4:(this.week===2?6:11)), label: "Rank 31-100", alliances: sorted.slice(30, 100) });
            return groups;
        },

        get filteredRefList() {
            const list = [...this.alliances].sort((a,b) => a.name.localeCompare(b.name));
            if (!this.refSearch) return list;
            return list.filter(a => a.tag.toLowerCase().includes(this.refSearch.toLowerCase()));
        },

        // --- HELPERS ---
        isAllyServer(group) {
            const me = this.alliances.find(a => a.name === this.myAllianceName);
            return me ? group.some(a => a.faction === me.faction) : true;
        },
        getPlayersForAlliance(tag) { return this.players.filter(p => (p.tag||'').toLowerCase() === tag.toLowerCase()).sort((a,b) => b.thp - a.thp); },
        isMatch(t) { 
            const me = this.factionData.find(a => a.name === this.myAllianceName);
            if (!me || t.faction === me.faction || t.faction === 'Unassigned') return false;
            const myG = this.getGroupedFaction(me.faction).find(g => g.alliances.some(x => x.tag === me.tag))?.id;
            const taG = this.getGroupedFaction(t.faction).find(g => g.alliances.some(x => x.tag === t.tag))?.id;
            return myG === taG;
        },
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
