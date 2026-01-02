window.warRoom = function() {
    return {
        // --- STATE ---
        tab: 'warroom', loading: true, mobileMenu: false, searchQuery: '', refSearch: '', debugStatus: 'Ready',
        week: 1, round1Reset: '', currentPhase: '', phaseAction: '', phaseCountdown: '', currentRoundText: '',
        alliances: [], players: [], history: [], cities: [], openAlliances: [], openServers: [],
        authenticated: false, passInput: '', editTag: '', modifiedTags: [], myAllianceName: '', 
        useServerTime: false, displayClock: '',

        seasonStart: new Date("2026/01/05 03:00:00"),

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

        // --- CALENDAR & PROJECTION ---
        getNextWarTime() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let war = new Date(cet);
            const warDays = [3, 6]; // Wed, Sat
            let found = false;
            while (!found) {
                if (warDays.includes(war.getDay())) {
                    war.setHours(15, 0, 0, 0);
                    if (war > cet) { found = true; break; }
                }
                war.setDate(war.getDate() + 1);
                war.setHours(15, 0, 0, 0);
            }
            return war;
        },

        updateClock() {
            const now = new Date();
            const cetTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const serverDate = new Date(cetTime.getTime() - (3 * 60 * 60 * 1000));
            this.displayClock = (this.useServerTime ? serverDate : cetTime).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});

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
                const hr = cetTime.getHours();
                const roundNum = ((this.week - 1) * 2) + ((day >= 1 && day <= 3) ? 1 : 2);
                this.currentRoundText = `Round ${roundNum}`;

                let ms = [{d:1,h:3,n:'Grouping Phase'},{d:2,h:3,n:'Declaration Window'},{d:3,h:3,n:'Invitation Phase'},{d:3,h:15,n:'Preparation'},{d:3,h:15.5,n:'WAR ACTIVE'},{d:4,h:3,n:'Grouping Phase'},{d:5,h:3,n:'Declaration Window'},{d:6,h:3,n:'Invitation Phase'},{d:6,h:15,n:'Preparation'},{d:6,h:15.5,n:'WAR ACTIVE'},{d:0,h:3,n:'Rest Phase'}];
                let next = ms.find(m => (day < m.d) || (day === m.d && hr < m.h)) || ms[0];
                const curr = [...ms].reverse().find(m => (day > m.d) || (day === m.d && hr >= m.h)) || ms[ms.length-1];
                this.currentPhase = curr.n;
                this.phaseAction = "Targeting updated by ranking.";
                
                let target = new Date(cetTime);
                target.setDate(target.getDate() + (next.d - day + (next.d < day || (next.d === day && next.h <= hr) ? 7 : 0)));
                target.setHours(next.h, 0, 0, 0);
                const dff = target - cetTime;
                this.phaseCountdown = `${Math.floor(dff/36e5)}h : ${Math.floor((dff%36e5)/6e4)}m : ${Math.floor((dff%6e4)/1e3)}s`;
            }
        },

        // --- DATA ---
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
            this.debugStatus = `OK: ${this.alliances.length}A Sync'd`;
        },

        getObservedRate(tag) {
            const snps = this.history.filter(x => (x.tag||'').toLowerCase() === tag.toLowerCase()).map(x => ({ ...x, dObj: new Date(x.timestamp.replace(/-/g, "/")) })).sort((a,b) => b.dObj - a.dObj);
            if (snps.length < 2) return 0;
            const cDiff = Number(snps[0].totalcopper.replace(/\D/g,'')) - Number(snps[1].totalcopper.replace(/\D/g,''));
            const hDiff = (snps[0].dObj - snps[1].dObj) / 3600000;
            return hDiff > 0.05 ? Math.round((cDiff / hDiff) / 100) * 100 : 0;
        },

        get factionData() {
            const now = new Date();
            const nextWar = this.getNextWarTime();
            return this.alliances.map(a => {
                const snps = this.history.filter(x => (x.tag||'').toLowerCase() === a.tag.toLowerCase()).map(x => ({ ...x, dObj: new Date(x.timestamp.replace(/-/g, "/")) })).sort((a,b) => b.dObj - a.dObj);
                const last = snps[0];
                const baseS = last ? Number(last.totalcopper.replace(/\D/g,'')) : 0;
                const lastT = last ? last.dObj : now;
                const rate = this.getObservedRate(a.tag);
                const hoursSince = (now - lastT) / 3600000;
                const hoursTillWar = (nextWar - now) / 3600000;
                return { ...a, stash: baseS + (rate * hoursSince), warStash: baseS + (rate * (hoursSince + hoursTillWar)), rate: rate };
            });
        },

        // --- GROUPING LOGIC ---
        getGroupedFaction(fName) {
            const sorted = this.factionData.filter(a => a.faction === fName).sort((a,b) => b.stash - a.stash);
            const groups = [];
            let step = 10; let maxRank = 30; let catchAll = 50;
            
            if (this.week === 2) { step = 6; maxRank = 30; catchAll = 50; }
            if (this.week >= 3) { step = 3; maxRank = 30; catchAll = 100; }

            let i = 0;
            while (i < maxRank && i < sorted.length) {
                const alliances = sorted.slice(i, i+step).map((item, idx) => ({ ...item, factionRank: i + idx + 1 }));
                groups.push({ id: Math.floor(i/step)+1, label: `Rank ${i+1}-${Math.min(i+step, maxRank)}`, alliances });
                i += step;
            }
            if (sorted.length > maxRank) {
                const alliances = sorted.slice(maxRank, catchAll).map((item, idx) => ({ ...item, factionRank: maxRank + 1 + idx }));
                groups.push({ id: groups.length + 1, label: `Rank ${maxRank+1}-${catchAll}`, alliances });
            }
            return groups;
        },

        get knsGroups() { return this.getGroupedFaction('Kage no Sato'); },
        get kbtGroups() { return this.getGroupedFaction('Koubutai'); },

        // --- MATCHING ---
        isMatch(target) {
            if (!this.myAllianceName) return false;
            const me = this.factionData.find(a => a.name === this.myAllianceName);
            if (!me || target.faction === me.faction) return false;
            const myG = (me.faction === 'Kage no Sato' ? this.knsGroups : this.kbtGroups).find(g => g.alliances.some(a => a.tag === me.tag))?.id;
            const taG = (target.faction === 'Kage no Sato' ? this.knsGroups : this.kbtGroups).find(g => g.alliances.some(a => a.tag === target.tag))?.id;
            return myG && myG === taG;
        },

        get filteredRefList() {
            const list = [...this.alliances].sort((a,b) => a.name.localeCompare(b.name));
            return this.refSearch ? list.filter(a => a.tag.toLowerCase().includes(this.refSearch.toLowerCase())) : list;
        },

        get groupedForces() {
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
        isAllyServer(group) {
            const me = this.alliances.find(a => a.name === this.myAllianceName);
            return me ? group.some(a => a.faction === me.faction) : true;
        },
        getPlayersForAlliance(tag) { return this.players.filter(p => (p.tag||'').toLowerCase() === tag.toLowerCase()).sort((a,b) => b.thp - a.thp); },
        matchesSearch(a) { const q = this.searchQuery.toLowerCase(); return (a.name||'').toLowerCase().includes(q) || (a.tag||'').toLowerCase().includes(q); },
        toggleAlliance(tag) { this.openAlliances = this.openAlliances.includes(tag) ? this.openAlliances.filter(x => x !== tag) : [...this.openAlliances, tag]; },
        isAllianceOpen(tag) { return this.openAlliances.includes(tag); },
        toggleServerCollapse(s) { this.openServers = this.isServerOpen(s) ? this.openServers.filter(x => x !== s) : [...this.openServers, s]; },
        isServerOpen(s) { return this.openServers.includes(s); },
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
