window.warRoom = function() {
    return {
        // --- CONFIG ---
        version: '2.5.0',
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        // --- STATE ---
        tab: 'warroom', loading: true, mobileMenu: false, searchQuery: '', refSearch: '', debugStatus: 'Initializing Command...',
        alliances: [], processedAlliances: [], players: [], pinnedTargets: [],
        openGroups: [], openServers: [], openAlliances: [],
        authenticated: false, passInput: '', editTag: '', managerName: '',
        importData: '', isImporting: false, comparisonTarget: null,
        displayClock: '', currentRoundText: '', currentPhase: '', phaseCountdown: '',
        week: 1, seasonStart: new Date("2026-01-05T03:00:00+01:00"), 

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
            
            // Load Pinned Targets
            const savedPins = localStorage.getItem('war_pinned_targets');
            if (savedPins) this.pinnedTargets = JSON.parse(savedPins);

            await this.fetchData();
            setInterval(() => this.updateClockOnly(), 1000);
            setInterval(() => this.refreshStashMath(), 60000);

            if (this.myAllianceName) { this.autoExpandMyGroup(); }
            const savedKey = localStorage.getItem('war_admin_key');
            if (savedKey) { this.passInput = savedKey; await this.login(true); }
            this.updateClockOnly();
        },

        async fetchData() {
            this.loading = true;
            this.debugStatus = "Syncing with Command Hub...";
            try {
                const { data, error } = await this.client.from('war_master_view').select('*');
                if (error) throw error;
                this.alliances = data || [];
                this.refreshStashMath();
                this.debugStatus = `Intel Synchronized`;
            } catch (e) { 
                console.error("Fetch Error:", e);
                this.debugStatus = "Offline Mode - Check Connection"; 
            }
            this.loading = false;
        },

        // --- TIME ENGINE (CET) ---
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
            if (day >= 1 && day < 4 && !(day === 4 && target.getHours() >= 3)) {
                target.setDate(target.getDate() + (4 - day));
            } else {
                target.setDate(target.getDate() + (day === 0 ? 1 : 8 - day));
            }
            target.setHours(3, 0, 0, 0);
            return target;
        },

        getNextWarTime() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            let startPoint = cet < this.seasonStart ? new Date(this.seasonStart) : new Date(cet);
            let target = new Date(startPoint);
            target.setHours(15, 30, 0, 0);
            let safety = 0;
            while (safety < 14) {
                const day = target.getDay();
                if ((day === 3 || day === 6) && target > startPoint) return target;
                target.setDate(target.getDate() + 1);
                safety++;
            }
            return target;
        },

        refreshStashMath() {
            const now = new Date();
            const cetNow = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const warTime = this.getNextWarTime();
            const rankingAnchor = this.getRankingAnchorTime();
            const groupStartForRanking = this.getGroupingStartTime(rankingAnchor);
            const nextGroupStartForUI = this.getGroupingStartTime(cetNow);

            this.processedAlliances = this.alliances.map(a => {
                let rate = Number(a.city_rate) > 0 ? Number(a.city_rate) : Number(a.observed_rate || 0);
                const scoutTime = a.last_scout_time ? new Date(a.last_scout_time) : cetNow;
                const hoursSinceScout = Math.max(0, (cetNow - scoutTime) / 3600000);
                const hoursUntilWar = Math.max(0, (warTime - cetNow) / 3600000);
                
                const currentStash = Number(a.last_copper || 0) + (rate * hoursSinceScout);
                const warStash = currentStash + (rate * hoursUntilWar);
                const groupStash = currentStash + (rate * (Math.max(0, (nextGroupStartForUI - cetNow) / 3600000)));
                const rankingStash = Number(a.last_copper || 0) + (rate * (Math.max(0, (groupStartForRanking - scoutTime) / 3600000)));

                return { ...a, stash: currentStash, warStash: warStash, groupStash: groupStash, rankingStash: rankingStash, rate: rate };
            });
        },

        getGroupedFaction(fName) {
            if (!fName || !this.processedAlliances.length) return [];
            const sorted = this.processedAlliances
                .filter(a => (a.faction || '').toLowerCase().includes(fName.toLowerCase()))
                .sort((a,b) => b.rankingStash - a.rankingStash);

            const groups = [];
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            let i = 0;
            while (i < 30 && i < sorted.length) {
                groups.push({ id: Math.floor(i/step)+1, label: `Rank ${i+1}-${Math.min(i+step, 30)}`, alliances: sorted.slice(i, i+step).map((it, idx) => ({ ...it, factionRank: i+idx+1 })) });
                i += step;
            }
            if (sorted.length > 30) { groups.push({ id: 99, label: "Rank 31-100", alliances: sorted.slice(30, 100).map((it, idx) => ({ ...it, factionRank: 31+idx })) }); }
            return groups;
        },

        updateClockOnly() {
            const now = new Date();
            const cet = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            this.displayClock = cet.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            const diffDays = Math.floor((cet - this.seasonStart) / 864e5);
            this.week = Math.max(1, Math.floor(diffDays / 7) + 1);
            const day = cet.getDay(), hr = cet.getHours();

            if (cet < this.seasonStart) {
                this.currentRoundText = "PRE-SEASON"; this.currentPhase = "Initializing";
                const diff = this.seasonStart - cet;
                const d = Math.floor(diff/864e5), h = Math.floor((diff%864e5)/36e5), m = Math.floor((diff%36e5)/6e4), s = Math.floor((diff%6e4)/1e3);
                this.phaseCountdown = `${d}d : ${h}h : ${m}m : ${s}s`; return;
            }

            const isR1 = (day >= 1 && day < 4 && !(day === 4 && hr >= 3));
            this.currentRoundText = `Week ${this.week} | Round ${isR1 ? 1 : 2}`;
            let phase = ""; let targetTime = new Date(cet);
            if (isR1) {
                if (day === 1 || (day === 2 && hr < 3)) { phase = "Grouping"; targetTime.setDate(cet.getDate() + (day === 1 ? 1 : 0)); targetTime.setHours(3,0,0,0); }
                else if (day === 2 || (day === 3 && hr < 3)) { phase = "Declaration"; targetTime.setDate(cet.getDate() + (day === 2 ? 1 : 0)); targetTime.setHours(3,0,0,0); }
                else if (day === 3 && hr < 15) { phase = "Invitation"; targetTime.setHours(15,0,0,0); }
                else if (day === 3 && hr < 18) { phase = "WAR ACTIVE"; targetTime.setHours(18,0,0,0); }
                else { phase = "Data Window"; targetTime.setDate(cet.getDate() + 1); targetTime.setHours(3,0,0,0); }
            } else {
                if (day === 4 || (day === 5 && hr < 3)) { phase = "Grouping"; targetTime.setDate(cet.getDate() + (day === 4 ? 1 : 0)); targetTime.setHours(3,0,0,0); }
                else if (day === 5 || (day === 6 && hr < 3)) { phase = "Declaration"; targetTime.setDate(cet.getDate() + (day === 5 ? 1 : 0)); targetTime.setHours(3,0,0,0); }
                else if (day === 6 && hr < 15) { phase = "Invitation"; targetTime.setHours(15,0,0,0); }
                else if (day === 6 && hr < 18) { phase = "WAR ACTIVE"; targetTime.setHours(18,0,0,0); }
                else { phase = "Rest Phase"; targetTime.setDate(cet.getDate() + (day === 0 ? 1 : 7-day+1)); targetTime.setHours(3,0,0,0); }
            }
            this.currentPhase = phase; const dff = targetTime - cet;
            this.phaseCountdown = `${Math.floor(dff/36e5)}h : ${Math.floor((dff%36e5)/6e4)}m : ${Math.floor((dff%6e4)/1e3)}s`;
        },

        // --- HELPERS ---
        isPinned(a) { return this.pinnedTargets.some(t => t.id === a.id); },
        togglePin(a) {
            if (this.isPinned(a)) { this.pinnedTargets = this.pinnedTargets.filter(t => t.id !== a.id); }
            else { if (this.pinnedTargets.length >= 5) return alert("Planner Full"); this.pinnedTargets.push(a); }
            localStorage.setItem('war_pinned_targets', JSON.stringify(this.pinnedTargets));
        },
        async openComparison(targetAlliance) {
            const me = this.alliances.find(a => a.name === this.myAllianceName);
            if (!me) return alert("Select your Alliance in sidebar first.");
            const { data: rosterData } = await this.client.from('players').select('*').in('alliance_id', [me.id, targetAlliance.id]).order('thp', { ascending: false });
            this.comparisonTarget = {
                me: { name: me.name, tag: me.tag, roster: rosterData.filter(p => p.alliance_id === me.id) },
                them: { name: targetAlliance.name, tag: targetAlliance.tag, roster: rosterData.filter(p => p.alliance_id === targetAlliance.id) }
            };
        },
        get knsTotalStash() { return this.processedAlliances.filter(a => a.faction.toLowerCase().includes('kage')).reduce((s, a) => s + a.stash, 0); },
        get kbtTotalStash() { return this.processedAlliances.filter(a => a.faction.toLowerCase().includes('koubu')).reduce((s, a) => s + a.stash, 0); },
        get knsGroups() { return this.getGroupedFaction('Kage'); },
        get kbtGroups() { return this.getGroupedFaction('Koubu'); },
        getFilteredRefList() {
            if (!this.refSearch) return [];
            return [...this.alliances].filter(a => (a.tag||'').toLowerCase().includes(this.refSearch.toLowerCase()) || (a.name||'').toLowerCase().includes(this.refSearch.toLowerCase())).sort((a,b) => (a.name||'').localeCompare(b.name)).slice(0, 5);
        },
        setReferenceAlliance(name) { this.myAllianceName = name; localStorage.setItem('war_ref_alliance', name); this.refSearch = ''; this.autoExpandMyGroup(); },
        autoExpandMyGroup() {
            const me = this.alliances.find(a => a.name === this.myAllianceName);
            if (me) {
                const groups = this.getGroupedFaction(me.faction);
                const myG = groups.find(g => g.alliances.some(x => x.id === me.id));
                if (myG) { const key = `${me.faction}-${myG.id}`; if(!this.openGroups.includes(key)) this.openGroups.push(key); }
            }
        },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1000000000).toFixed(2) + 'B'; },
        matchesSearch(a) { 
            if(!this.searchQuery) return true;
            const q = this.searchQuery.toLowerCase();
            return (a.name||'').toLowerCase().includes(q) || (a.tag||'').toLowerCase().includes(q);
        },
        toggleGroup(f, id) { const key = `${f}-${id}`; this.openGroups = this.openGroups.includes(key) ? this.openGroups.filter(k => k !== key) : [...this.openGroups, key]; },
        isGroupOpen(f, id) { return this.openGroups.includes(`${f}-${id}`); },
        isMatch(t) { 
            const me = this.alliances.find(a => a.name === this.myAllianceName); 
            if (!me || !t.faction || !me.faction || t.faction === me.faction || t.faction === 'Unassigned') return false; 
            const myG = this.getGroupedFaction(me.faction).find(g => g.alliances.some(x => x.id === me.id))?.id;
            const taG = this.getGroupedFaction(t.faction).find(g => g.alliances.some(x => x.tag === t.tag))?.id;
            return myG && taG && myG === taG; 
        },
        async login(isAuto = false) {
            const { data } = await this.client.from('authorized_managers').select('manager_name').eq('secret_key', this.passInput).single();
            if (data) { this.authenticated = true; this.managerName = data.manager_name; localStorage.setItem('war_admin_key', this.passInput); }
        },
        async processImport() {
            this.isImporting = true;
            try {
                const cleanData = JSON.parse(this.importData); let count = 0;
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
