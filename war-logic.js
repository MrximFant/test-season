window.warRoom = function() {
    return {
        // --- CONFIG ---
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        // --- STATE ---
        tab: 'warroom', loading: true, searchQuery: '', refSearch: '',
        alliances: [], players: [], 
        openGroups: [], openServers: [], openAlliances: [], // Collapsed by default
        authenticated: false, passInput: '', editTag: '',
        displayClock: '', currentRoundText: '', currentPhase: '', phaseCountdown: '',
        seasonStart: new Date("2026/01/05 03:00:00"),

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            this.myAllianceName = localStorage.getItem('war_ref_alliance') || '';
            
            await this.fetchData();

            // AUTO-EXPAND REFERENCE GROUP
            if (this.myAllianceName) {
                const me = this.alliances.find(a => a.name === this.myAllianceName);
                if (me) {
                    const groups = this.getGroupedFaction(me.faction);
                    const myG = groups.find(g => g.alliances.some(x => x.id === me.id));
                    if (myG) this.openGroups.push(`${me.faction}-${myG.id}`);
                }
            }

            this.updateClock();
            setInterval(() => this.updateClock(), 1000);
        },

        async fetchData() {
            try {
                const [resMaster, resPlayers] = await Promise.all([
                    this.client.from('war_master_view').select('*'),
                    this.client.from('players').select('*').order('thp', { ascending: false })
                ]);
                this.alliances = resMaster.data.map(a => ({
                    ...a, stash: Number(a.est_stash_now), warStash: Number(a.est_stash_war), rate: Number(a.hourly_rate)
                }));
                this.players = resPlayers.data;
            } catch (e) { console.error(e); }
            this.loading = false;
        },

        // --- GROUPING LOGIC ---
        getGroupedFaction(fName) {
            const sorted = this.alliances
                .filter(a => a.faction.toLowerCase().includes(fName.toLowerCase()))
                .sort((a,b) => b.stash - a.stash);

            const groups = [];
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            let i = 0;
            while (i < 30 && i < sorted.length) {
                groups.push({ 
                    id: Math.floor(i/step)+1, 
                    label: `Rank ${i+1}-${Math.min(i+step, 30)}`, 
                    alliances: sorted.slice(i, i+step).map((it, idx) => ({ ...it, factionRank: i+idx+1 })) 
                });
                i += step;
            }
            if (sorted.length > 30) groups.push({ id: groups.length + 1, label: "Rank 31-100", alliances: sorted.slice(30, 100).map((it, idx) => ({ ...it, factionRank: 31+idx })) });
            return groups;
        },

        toggleGroup(f, id) {
            const key = `${f}-${id}`;
            this.openGroups = this.openGroups.includes(key) ? this.openGroups.filter(k => k !== key) : [...this.openGroups, key];
        },

        getPlayersForAlliance(id) { return this.players.filter(p => p.alliance_id === id); },

        // --- CLOCK & SCHEDULE ---
        updateClock() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});

            const diffDays = Math.floor((cet - this.seasonStart) / 864e5);
            this.week = Math.max(1, Math.min(4, Math.floor(diffDays / 7) + 1));
            const day = cet.getDay();
            
            this.currentRoundText = `Round ${((this.week-1)*2) + (day >= 4 || day === 0 ? 2 : 1)}`;

            let ms = [
                {d:1,h:3,n:'Grouping Phase'}, {d:2,h:3,n:'Declaration Stage'}, 
                {d:3,h:15.5,n:'WAR ACTIVE'}, {d:4,h:3,n:'Grouping Phase'}, 
                {d:5,h:3,n:'Declaration Stage'}, {d:6,h:15.5,n:'WAR ACTIVE'}, {d:0,h:3,n:'Rest Phase'}
            ];
            let next = ms.find(m => (day < m.d) || (day === m.d && cet.getHours() < m.h)) || ms[0];
            const curr = [...ms].reverse().find(m => (day > m.d) || (day === m.d && cetTime.getHours() >= m.h)) || ms[ms.length-1];
            
            this.currentPhase = curr.n;
            let target = new Date(cet);
            target.setDate(target.getDate() + (next.d - day + (next.d < day || (next.d === day && next.h <= cet.getHours()) ? 7 : 0)));
            target.setHours(Math.floor(next.h), (next.h % 1) * 60, 0, 0);
            
            const dff = target - cet;
            this.phaseCountdown = `${Math.floor(dff/36e5)}h : ${Math.floor((dff%36e5)/6e4)}m : ${Math.floor((dff%6e4)/1e3)}s`;
        },

        get groupedForces() {
            const groups = {};
            this.alliances.forEach(a => {
                if (!groups[a.server]) groups[a.server] = [];
                groups[a.server].push(a);
            });
            Object.keys(groups).forEach(s => groups[s].sort((a,b) => b.aceTHP - a.aceTHP));
            return groups;
        },

        // --- HELPERS ---
        isMatch(t) { 
            const me = this.alliances.find(a => a.name === this.myAllianceName); 
            if (!me || !t.faction || !me.faction || t.faction === me.faction || t.faction === 'Unassigned') return false; 
            const myG = this.getGroupedFaction(me.faction).find(g => g.alliances.some(x => x.id === me.id))?.id;
            const taG = this.getGroupedFaction(t.faction).find(g => g.alliances.some(x => x.tag === t.tag))?.id;
            return myG && taG && myG === taG; 
        },
        toggleServerCollapse(s) { this.openServers = this.openServers.includes(s) ? this.openServers.filter(x => x !== s) : [...this.openServers, s]; },
        toggleAlliance(id) { this.openAlliances = this.openAlliances.includes(id) ? this.openAlliances.filter(x => x !== id) : [...this.openAlliances, id]; },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1000000000).toFixed(2) + 'B'; },
        matchesSearch(a) { const q = this.searchQuery.toLowerCase(); return !q || a.name.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q); },
        isAllyServer(group) { const me = this.alliances.find(a => a.name === this.myAllianceName); return me ? group.some(a => a.faction === me.faction) : true; },
        saveSettings() { localStorage.setItem('war_ref_alliance', this.myAllianceName); },
        login() { /* Secret Key Logic */ }
    }
}
