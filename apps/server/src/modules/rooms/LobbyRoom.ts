import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { PlayerState as SharedPlayerState, ItemRarity, RarityConfigs } from "@medieval-patterns/shared";

export class Player extends Schema implements SharedPlayerState {
    @type("string") id: string = "";
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("number") rotation: number = 0;
    @type("number") hp: number = 100;
    @type("number") stamina: number = 100;
    @type("boolean") isDodging: boolean = false;
}

export class Boss extends Schema {
    @type("string") id: string = "boss-1";
    @type("number") x: number = 5;
    @type("number") z: number = 5;
    @type("number") hp: number = 1000;
    @type("number") maxHp: number = 1000;
    @type("string") phase: "normal" | "enraged" = "normal";
    @type("boolean") isTelegraphing: boolean = false;
    @type("number") telegraphRadius: number = 0;
    @type("number") telegraphPositionX: number = 0;
    @type("number") telegraphPositionZ: number = 0;
}

export class LobbyState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type(Boss) boss = new Boss();
}

export class LobbyRoom extends Room<LobbyState> {
    maxClients = 8;
    
    // Server loop
    fixedTimeStep = 1000 / 60;
    
    onCreate(options: any) {
        console.log("LobbyRoom created!", options);
        this.setState(new LobbyState());

        this.onMessage("move", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.x = data.x;
                player.z = data.z;
                player.rotation = data.rotation;
            }
        });

        this.onMessage("dodge", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player && !player.isDodging && player.stamina >= 30) {
                player.isDodging = true;
                player.stamina -= 30;
                
                // Remove dodge state after 0.25 seconds
                this.clock.setTimeout(() => {
                    if (this.state.players.has(client.sessionId)) {
                        this.state.players.get(client.sessionId)!.isDodging = false;
                    }
                }, 250);
            }
        });

        this.onMessage("attack_boss", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player && !player.isDodging) { // Cant attack while dodging
                // In a real game, check distance between player and boss here
                this.state.boss.hp -= data.damage;
                
                if (this.state.boss.hp <= 400 && this.state.boss.phase === "normal") {
                    this.state.boss.phase = "enraged";
                    console.log("Boss enraged!");
                }

                if (this.state.boss.hp <= 0) {
                    this.handleBossDeath();
                }
            }
        });
        
        this.setSimulationInterval((deltaTime) => this.update(deltaTime), this.fixedTimeStep);
        
        // Setup Boss AI Loop
        this.clock.setInterval(() => this.bossAI(), 3000);
    }
    
    update(deltaTime: number) {
        // Regenerate stamina
        this.state.players.forEach((player) => {
            if (player.stamina < 100 && !player.isDodging) {
                player.stamina = Math.min(100, player.stamina + 0.5); // Regenerate per tick
            }
        });
    }

    bossAI() {
        if (this.state.boss.hp <= 0) return;
        
        // Pick a random player to attack
        const playerKeys = Array.from(this.state.players.keys());
        if (playerKeys.length === 0) return;
        
        const targetKey = playerKeys[Math.floor(Math.random() * playerKeys.length)];
        const target = this.state.players.get(targetKey);
        
        if (target) {
            // Telegraph attack
            this.state.boss.isTelegraphing = true;
            this.state.boss.telegraphRadius = this.state.boss.phase === "enraged" ? 8 : 5;
            this.state.boss.telegraphPositionX = target.x;
            this.state.boss.telegraphPositionZ = target.z;
            
            // Execute attack after delay
            const delay = this.state.boss.phase === "enraged" ? 1000 : 2000;
            this.clock.setTimeout(() => {
                this.executeBossAttack();
            }, delay);
        }
    }
    
    executeBossAttack() {
        if (this.state.boss.hp <= 0) {
            this.state.boss.isTelegraphing = false;
            return;
        }
        
        const attackX = this.state.boss.telegraphPositionX;
        const attackZ = this.state.boss.telegraphPositionZ;
        const radius = this.state.boss.telegraphRadius;
        
        this.state.players.forEach((player) => {
            if (!player.isDodging) {
                const dx = player.x - attackX;
                const dz = player.z - attackZ;
                const distSq = dx * dx + dz * dz;
                
                if (distSq <= radius * radius) {
                    player.hp -= 20;
                    if (player.hp <= 0) {
                        player.hp = 100; // simple respawn
                        // Handle gold loss logic here...
                        console.log(`Player ${player.id} died to boss!`);
                    }
                }
            }
        });
        
        this.state.boss.isTelegraphing = false;
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined!");
        const player = new Player();
        player.id = client.sessionId;
        this.state.players.set(client.sessionId, player);
    }

    onLeave(client: Client, consented: boolean) {
        console.log(client.sessionId, "left!");
        this.state.players.delete(client.sessionId);
    }

    handleBossDeath() {
        console.log("Boss died! Generating loot...");
        this.state.boss.isTelegraphing = false;
        
        // Generate instanced loot for each player
        this.state.players.forEach((player, sessionId) => {
            const loot = this.generateLoot();
            // In a real app, save to DB here via Prisma.
            // For now, notify the player.
            const client = this.clients.find(c => c.sessionId === sessionId);
            if (client) {
                client.send("loot_drop", loot);
            }
        });

        // Respawn boss after 10 seconds
        this.clock.setTimeout(() => {
            this.state.boss.hp = this.state.boss.maxHp;
            this.state.boss.phase = "normal";
        }, 10000);
    }

    generateLoot() {
        const rand = Math.random() * 100;
        let rarity = ItemRarity.Common;
        
        let cumulative = 0;
        // Reversed iteration or proper cumulative distribution
        const tiers = [
            ItemRarity.Mythic, ItemRarity.Elite, ItemRarity.Epic, 
            ItemRarity.Rare, ItemRarity.Uncommon, ItemRarity.Common
        ];
        
        for (const r of tiers) {
            cumulative += RarityConfigs[r].dropChance;
            if (rand <= cumulative) {
                rarity = r;
                break;
            }
        }

        // Weighted float generation (exponential)
        const floatVal = Math.pow(Math.random(), 3); // Favors worse floats
        const patternSeed = Math.floor(Math.random() * 999) + 1;

        return {
            id: Math.random().toString(36).substring(7),
            rarity,
            floatVal,
            patternSeed,
            isAppraised: false
        };
    }
}
