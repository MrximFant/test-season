window.warRoom = function() {
    return {
        // --- CONFIG ---
        sbUrl: 'https://kjyikmetuciyoepbdzuz.supabase.co',
        sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqeWlrbWV0dWNpeW9lcGJkenV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTMyNDUsImV4cCI6MjA4MjkyOTI0NX0.0bxEk7nmkW_YrlVsCeLqq8Ewebc2STx4clWgCfJus48',

        // --- STATE ---
        tab: 'warroom', loading: true, mobileMenu: false, searchQuery: '', refSearch: '', debugStatus: 'Ready',
        week: 1, currentPhase: '', phaseAction: '', phaseCountdown: '', currentRoundText: '',
        alliances: [], openAlliances: [], openServers: [],
        authenticated: false, passInput: '', editTag: '', managerName: '',
        importData: '', importMode: 'scout', isImporting: false,
        useServerTime: false, displayClock: '',
        seasonStart: new Date("2026/01/05 03:00:00"),

        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            this.myAllianceName = localStorage.getItem('war_ref_alliance') || '';
            this.useServerTime = localStorage.getItem('war_time_mode') === 'true';

            // 1. Load Cache for Instant UI
            const cached = localStorage.getItem('war_data_cache');
            if (cached) {
                this.alliances = JSON.parse(cached);
                this.loading = false;
            }

            // 2. Check if already logged in
            const savedKey = localStorage.getItem('war_admin_key');
            if (savedKey) {
                this.passInput = savedKey;
                await this.login(true);
            }

            // 3. Background Fetch
            await this.fetchData();
            this.updateClock();
            setInterval(() => this.updateClock(), 1000);
        },

        saveSettings() {
            localStorage.setItem('war_ref_alliance', this.myAllianceName);
            localStorage.setItem('war_time_mode', this.useServerTime);
        },

        // --- DATA SYNC ---
        async fetchData() {
            try {
                // Fetch from the pre-calculated MASTER VIEW
                const { data, error } = await this.client.from('war_master_view').select('*');
                if (error) throw error;

                this.alliances = data.map(a => ({
                    id: a.id,
                    server: a.server,
                    tag: (a.tag || '').trim(),
                    name: a.name || 'Unknown',
                    faction: a.faction || 'Unassigned',
                    power: Number(a.power || 0),
                    rate: Number(a.hourly_rate || 0),
                    stash: Number(a.est_stash_now || 0),
                    warStash: Number(a.est_stash_war || 0),
                    aceTHP: Number(a.ace_thp || 0),
                    members: Number(a.member_count || 0),
                    cities: { l1:a.l1, l2:a.l2, l3:a.l3, l4:a.l4, l5:a.l5, l6:a.l6 }
                }));

                localStorage.setItem('war_data_cache', JSON.stringify(this.alliances));
                this.debugStatus = `Intel Synced (CET Projections Active)`;
            } catch (e) {
                console.error("Fetch Error:", e);
                this.debugStatus = "Sync Error";
            }
            this.loading = false;
        },

        // --- AUTH ---
        async login(isAuto = false) {
            const { data, error } = await this.client
                .from('authorized_managers')
                .select('manager_name')
                .eq('secret_key', this.passInput)
                .single();

            if (data) {
                this.authenticated = true;
                this.managerName = data.manager_name;
                localStorage.setItem('war_admin_key', this.passInput);
                if (!isAuto) alert(`Welcome, Commander ${data.manager_name}`);
            } else if (!isAuto) {
                alert("Invalid Access Key.");
                localStorage.removeItem('war_admin_key');
            }
        },

        // --- ADMIN: OCR IMPORT ---
        async processImport() {
            if (!this.importData.trim()) return;
            this.isImporting = true;
            const lines = this.importData.split('\n');
            let successCount = 0;

            for (const line of lines) {
                // Regex for format: [TAG] Name Numbers
                const match = line.match(/\[(.*?)\]\s+(.*?)\s+([\d,.]+)/);
                if (!match) continue;

                const [_, tag, name, valStr] = match;
                const val = parseInt(valStr.replace(/[,.]/g, ''));
                const alliance = this.alliances.find(a => a.tag.toLowerCase() === tag.trim().toLowerCase());

                try {
                    if (this.importMode === 'scout' && alliance) {
                        // Log copper history via UUID
                        await this.client.from('history').insert({ alliance_id: alliance.id, copper: val });
                        // Update name in case it changed
                        await this.client.from('alliances').update({ name: name.trim() }).eq('id', alliance.id);
                        successCount++;
                    } else if (this.importMode === 'alliance') {
                        // Update total power via Tag/Server unique anchor
                        await this.client.from('alliances').upsert({ 
                            tag: tag.trim(), name: name.trim(), power: val, server: alliance?.server || '?'
                        }, { onConflict: 'server,tag' });
                        successCount++;
                    }
                } catch (e) { console.error(e); }
            }

            alert(`Import Complete: ${successCount} entries processed.`);
            this.importData = '';
            this.isImporting = false;
            await this.fetchData();
        },

        // --- ADMIN: CITIES ---
        async saveCitiesToDB() {
            const alliance = this.alliances.find(a => a.tag === this.editTag);
            if (!alliance) return;

            const { error } = await this.client.from('cities').upsert({
                alliance_id: alliance.id,
                ...alliance.cities
            });

            if (error) alert("DB Error: " + error.message);
            else { alert("Tactical Occupation Updated."); await this.fetchData(); }
        },

        // --- GROUPING LOGIC ---
        applyGrouping(sortedList) {
            const groups = [];
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            let i = 0;
            while (i < 30 && i < sortedList.length) {
                groups.push({ 
                    id: Math.floor(i/step)+1, 
                    label: `Rank ${i+1}-${Math.min(i+step, 30)}`, 
                    alliances: sortedList.slice(i, i+step).map((it, idx) => ({ ...it, factionRank: i+idx+1 })) 
                });
                i += step;
            }
            if (sortedList.length > 30) {
                groups.push({ 
                    id: groups.length + 1, 
                    label: "Rank 31-100", 
                    alliances: sortedList.slice(30, 100).map((it, idx) => ({ ...it, factionRank: 31+idx })) 
                });
            }
            return groups;
        },

        get knsGroups() { 
            const list = this.alliances.filter(a => a.faction.toLowerCase().includes('kage') && this.matchesSearch(a)).sort((a,b) => b.stash - a.stash);
            return this.applyGrouping(list);
        },
        get kbtGroups() { 
            const list = this.alliances.filter(a => a.faction.toLowerCase().includes('koubu') && this.matchesSearch(a)).sort((a,b) => b.stash - a.stash);
            return this.applyGrouping(list);
        },

        // --- CLOCK ---
        updateClock() {
            const now = new Date();
            const cetTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
            const serverDate = new Date(cetTime.getTime() - (3 * 60 * 60 * 1000));
            const activeTime = this.useServerTime ? serverDate : cetTime;
            this.displayClock = activeTime.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit', second:'2-digit'});

            if (cetTime < this.seasonStart) {
                this.currentRoundText = "PRE-SEASON";
                this.currentPhase = "Awaiting Combat";
                const diff = this.seasonStart - cetTime;
                this.phaseCountdown = `${Math.floor(diff/864e5)}d : ${Math.floor((diff%864e5)/36e5)}h : ${Math.floor((diff%36e5)/6e4)}m`;
                this.week = 1;
            } else {
                const diffDays = Math.floor((cetTime - this.seasonStart) / 864e5);
                this.week = Math.max(1, Math.min(4, Math.floor(diffDays / 7) + 1));
                const day = cetTime.getDay();
                this.currentRoundText = `Round ${((this.week-1)*2) + (day <= 3 ? 1 : 2)}`;

                let ms = [{d:1,h:3,n:'Grouping'},{d:2,h:3,n:'Declaration'},{d:3,h:3,n:'Invitation'},{d:3,h:12,n:'Prep'},{d:3,h:12.5,n:'WAR'},{d:4,h:3,n:'Grouping'},{d:5,h:3,n:'Declaration'},{d:6,h:3,n:'Invitation'},{d:6,h:12,n:'Prep'},{d:6,h:12.5,n:'WAR'},{d:0,h:3,n:'Rest'}];
                let next = ms.find(m => (day < m.d) || (day === m.d && cetTime.getHours() < m.h)) || ms[0];
                const curr = [...ms].reverse().find(m => (day > m.d) || (day === m.d && cetTime.getHours() >= m.h)) || ms[ms.length-1];
                this.currentPhase = curr.n;
                
                let target = new Date(cetTime);
                target.setDate(target.getDate() + (next.d - day + (next.d < day || (next.d === day && next.h <= cetTime.getHours()) ? 7 : 0)));
                target.setHours(next.h, 0, 0, 0);
                const dff = target - cetTime;
                this.phaseCountdown = `${Math.floor(dff/36e5)}h : ${Math.floor((dff%36e5)/6e4)}m : ${Math.floor((dff%6e4)/1e3)}s`;
            }
        },

        // --- HELPERS ---
        get knsTotalStash() { return this.alliances.filter(a => a.faction.toLowerCase().includes('kage')).reduce((s, a) => s + a.stash, 0); },
        get kbtTotalStash() { return this.alliances.filter(a => a.faction.toLowerCase().includes('koubu')).reduce((s, a) => s + a.stash, 0); },
        get groupedForces() {
            const groups = {};
            this.alliances.forEach(a => {
                if (!groups[a.server]) groups[a.server] = [];
                groups[a.server].push(a);
            });
            Object.keys(groups).forEach(s => groups[s].sort((a,b) => b.aceTHP - a.aceTHP));
            return groups;
        },
        get filteredRefList() {
            const list = [...this.alliances].sort((a,b) => a.name.localeCompare(b.name));
            return this.refSearch ? list.filter(a => a.tag.toLowerCase().includes(this.refSearch.toLowerCase())) : list;
        },
        isAllyServer(group) { const me = this.alliances.find(a => a.name === this.myAllianceName); return me ? group.some(a => a.faction === me.faction) : true; },
        isMatch(t) { 
            const me = this.alliances.find(a => a.name === this.myAllianceName); 
            if (!me || !t.faction || !me.faction || t.faction === me.faction || t.faction === 'Unassigned') return false; 
            const myG = this.getGroupedFaction(me.faction).find(g => g.alliances.some(x => x.tag === me.tag))?.id;
            const taG = this.getGroupedFaction(t.faction).find(g => g.alliances.some(x => x.tag === t.tag))?.id;
            return myG && taG && myG === taG; 
        },
        matchesSearch(a) { const q = this.searchQuery.toLowerCase(); return !q || a.name.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q); },
        toggleAlliance(tag) { this.openAlliances = this.isAllianceOpen(tag) ? this.openAlliances.filter(x => x !== tag) : [...this.openAlliances, tag]; },
        isAllianceOpen(tag) { return this.openAlliances.includes(tag); },
        toggleServerCollapse(s) { this.openServers = this.isServerOpen(s) ? this.openServers.filter(x => x !== s) : [...this.openServers, s]; },
        isServerOpen(s) { return this.openServers.includes(s); },
        getCityCount(n) { const a = this.alliances.find(x => x.tag === this.editTag); return a ? a.cities['l'+n] : 0; },
        getTotalCities() { const a = this.alliances.find(x => x.tag === this.editTag); return a ? Object.values(a.cities).reduce((s,v)=>s+v,0) : 0; },
        updateCity(n, d) { const a = this.alliances.find(x => x.tag === this.editTag); if (a) { if (d > 0 && this.getTotalCities() >= 6) return alert("Max 6 cities!"); a.cities['l'+n] = Math.max(0, a.cities['l'+n] + d); }},
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1000000000).toFixed(2) + 'B'; },
        copyScoutPrompt() { navigator.clipboard.writeText("Please provide: [Tag], [Alliance], [Stash], [Time]"); alert("Scout Prompt Copied!"); }
    }
}
