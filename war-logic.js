window.warRoom = function() {
    return {
        version: '2.2.5',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        tab: 'warroom', loading: true, mobileMenu: false, searchQuery: '', refSearch: '',
        alliances: [], players: [], openGroups: [], openServers: [], openAlliances: [],
        authenticated: false, passInput: '', editTag: '', managerName: '',
        importData: '', importMode: 'scout', isImporting: false,
        displayClock: '', currentRoundText: '', currentPhase: '', phaseCountdown: '',
        seasonStart: new Date("2026/01/05 03:00:00"),

        async init() {
            const storedVersion = localStorage.getItem('war_app_version');
            if (storedVersion !== this.version) {
                localStorage.clear();
                localStorage.setItem('war_app_version', this.version);
                window.location.reload(true);
                return;
            }
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            this.myAllianceName = localStorage.getItem('war_ref_alliance') || '';
            
            await this.fetchData();

            // Auto-expand group for reference alliance
            if (this.myAllianceName) {
                const me = this.alliances.find(a => a.name === this.myAllianceName);
                if (me) {
                    const groups = this.getGroupedFaction(me.faction);
                    const myG = groups.find(g => g.alliances.some(x => x.id === me.id));
                    if (myG) this.openGroups.push(`${me.faction}-${myG.id}`);
                }
            }

            const savedKey = localStorage.getItem('war_admin_key');
            if (savedKey) { this.passInput = savedKey; await this.login(true); }

            this.updateClock();
            setInterval(() => this.updateClock(), 1000);
        },

        async fetchData() {
            try {
                const [resM, resP] = await Promise.all([
                    this.client.from('war_master_view').select('*'),
                    this.client.from('players').select('*').order('thp', { ascending: false })
                ]);
                this.alliances = resM.data || [];
                this.players = resP.data || [];
            } catch (e) { console.error(e); }
            this.loading = false;
        },

        // --- MATH ENGINE ---
        get factionData() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const warTime = this.getNextWarTime();

            return this.alliances.map(a => {
                // Determine rate: Use observed rate if scouts exist, otherwise use passive city rate
                const rate = a.observed_rate > 0 ? a.observed_rate : a.city_rate;
                
                const scoutTime = a.last_scout_time ? new Date(a.last_scout_time) : cet;
                const hoursSinceScout = Math.max(0, (cet - scoutTime) / 3600000);
                const hoursUntilWar = Math.max(0, (warTime - cet) / 3600000);

                const currentStash = Number(a.last_copper || 0) + (rate * hoursSinceScout);
                const warStash = currentStash + (rate * hoursUntilWar);

                return { ...a, stash: currentStash, warStash: warStash, rate: rate };
            });
        },

        getNextWarTime() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let target = new Date(cet);
            const day = cet.getDay();

            // War is Wednesday (3) and Saturday (6) at 15:30
            if (day < 3 || (day === 3 && cet.getHours() < 15) || (day === 3 && cet.getHours() === 15 && cet.getMinutes() < 30)) {
                target.setDate(cet.getDate() + (3 - day));
            } else if (day < 6 || (day === 6 && cet.getHours() < 15) || (day === 6 && cet.getHours() === 15 && cet.getMinutes() < 30)) {
                target.setDate(cet.getDate() + (6 - day));
            } else {
                target.setDate(cet.getDate() + (7 - day + 3));
            }
            target.setHours(15, 30, 0, 0);
            return target;
        },

        updateClock() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});

            const diffDays = Math.floor((cet - this.seasonStart) / 864e5);
            this.week = Math.max(1, Math.min(4, Math.floor(diffDays / 7) + 1));
            const day = cet.getDay();
            
            // Rounds: R1 (Mon 03:00 - Thu 03:00), R2 (Thu 03:00 - Mon 03:00)
            const isR1 = (day >= 1 && day < 4) || (day === 4 && cet.getHours() < 3);
            this.currentRoundText = `Week ${this.week} | Round ${isR1 ? 1 : 2}`;

            let ms = [
                {d:1,h:3,n:'Grouping Phase'}, {d:2,h:3,n:'Declaration Stage'}, 
                {d:3,h:15.5,n:'WAR ACTIVE'}, {d:4,h:3,n:'Grouping Phase'}, 
                {d:5,h:3,n:'Declaration Stage'}, {d:6,h:15.5,n:'WAR ACTIVE'}, {d:0,h:3,n:'Rest Phase'}
            ];
            let next = ms.find(m => (day < m.d) || (day === m.d && cet.getHours() < m.h)) || ms[0];
            const curr = [...ms].reverse().find(m => (day > m.d) || (day === m.d && cet.getHours() >= m.h)) || ms[ms.length-1];
            
            this.currentPhase = curr.n;
            let targetDate = new Date(cet);
            targetDate.setDate(targetDate.getDate() + (next.d - day + (next.d < day || (next.d === day && next.h <= cet.getHours()) ? 7 : 0)));
            targetDate.setHours(Math.floor(next.h), (next.h % 1) * 60, 0, 0);
            
            const dff = targetDate - cet;
            this.phaseCountdown = `${Math.floor(dff/36e5)}h : ${Math.floor((dff%36e5)/6e4)}m : ${Math.floor((dff%6e4)/1e3)}s`;
        },

        getGroupedFaction(fName) {
            const sorted = this.factionData
                .filter(a => a.faction.toLowerCase().includes(fName.toLowerCase()))
                .sort((a,b) => b.stash - a.stash);
            const groups = [];
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            let i = 0;
            while (i < 30 && i < sorted.length) {
                groups.push({ id: Math.floor(i/step)+1, label: `Rank ${i+1}-${Math.min(i+step, 30)}`, alliances: sorted.slice(i, i+step).map((it, idx) => ({ ...it, factionRank: i+idx+1 })) });
                i += step;
            }
            if (sorted.length > 30) groups.push({ id: groups.length + 1, label: "Rank 31-100", alliances: sorted.slice(30, 100).map((it, idx) => ({ ...it, factionRank: 31+idx })) });
            return groups;
        },

        get knsGroups() { return this.getGroupedFaction('Kage'); },
        get kbtGroups() { return this.getGroupedFaction('Koubu'); },
        get knsTotalStash() { return this.factionData.filter(a => a.faction.toLowerCase().includes('kage')).reduce((s, a) => s + a.stash, 0); },
        get kbtTotalStash() { return this.factionData.filter(a => a.faction.toLowerCase().includes('koubu')).reduce((s, a) => s + a.stash, 0); },

        get groupedForces() {
            const groups = {};
            this.factionData.forEach(a => {
                if (!groups[a.server]) groups[a.server] = [];
                groups[a.server].push(a);
            });
            Object.keys(groups).forEach(s => groups[s].sort((a,b) => b.ace_thp - a.ace_thp));
            return groups;
        },

        // --- HELPERS ---
        toggleGroup(f, id) { const key = `${f}-${id}`; this.openGroups = this.openGroups.includes(key) ? this.openGroups.filter(k => k !== key) : [...this.openGroups, key]; },
        isGroupOpen(f, id) { return this.openGroups.includes(`${f}-${id}`); },
        toggleServerCollapse(s) { this.openServers = this.openServers.includes(s) ? this.openServers.filter(x => x !== s) : [...this.openServers, s]; },
        isServerOpen(s) { return this.openServers.includes(s); },
        toggleAlliance(id) { this.openAlliances = this.openAlliances.includes(id) ? this.openAlliances.filter(x => x !== id) : [...this.openAlliances, id]; },
        isAllianceOpen(id) { return this.openAlliances.includes(id); },
        getPlayersForAlliance(id) { return this.players.filter(p => p.alliance_id === id); },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1000000000).toFixed(2) + 'B'; },
        copyScoutPrompt() { 
            const prompt = `Convert the following OCR text into a JSON array. 
            Format: [{"tag": "MAD1", "name": "AllianceName", "stash": 12345678}]. 
            OCR Data: \n${this.importData}`;
            navigator.clipboard.writeText(prompt);
            alert("AI Prompt Copied! Paste into ChatGPT/Claude.");
        },
        async login(isAuto = false) {
            const { data } = await this.client.from('authorized_managers').select('manager_name').eq('secret_key', this.passInput).single();
            if (data) { this.authenticated = true; this.managerName = data.manager_name; localStorage.setItem('war_admin_key', this.passInput); }
        },
        async saveCitiesToDB() {
            const a = this.alliances.find(x => x.tag === this.editTag);
            if (!a) return;
            await this.client.from('cities').upsert({ alliance_id: a.id, l1:a.l1, l2:a.l2, l3:a.l3, l4:a.l4, l5:a.l5, l6:a.l6 });
            alert("Saved!"); await this.fetchData();
        }
    }
}
