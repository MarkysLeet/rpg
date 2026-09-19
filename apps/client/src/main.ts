import './style.css';
import * as THREE from 'three';
import { Client, Room } from 'colyseus.js';
import { getAuraHue } from '@medieval-patterns/shared';



// --- UI Elements ---
const startMenu = document.getElementById('start-menu')!;
const nicknameInput = document.getElementById('nickname-input') as HTMLInputElement;
const playBtn = document.getElementById('play-btn')!;
const gameUi = document.getElementById('game-ui')!;
const statusEl = document.getElementById('status')!;
const hpText = document.getElementById('hp-text')!;
const hpBar = document.getElementById('hp-bar')!;
const staminaText = document.getElementById('stamina-text')!;
const staminaBar = document.getElementById('stamina-bar')!;
const goldText = document.getElementById('gold-text')!;


// Inventory UI
const inventoryUi = document.getElementById('inventory-ui')!;
const inventoryGrid = document.getElementById('inventory-grid')!;
const closeInventoryBtn = document.getElementById('close-inventory-btn')!;

// Blacksmith UI
const blacksmithUi = document.getElementById('blacksmith-ui')!;
const blacksmithItems = document.getElementById('blacksmith-items')!;
const closeBlacksmithBtn = document.getElementById('close-blacksmith-btn')!;

let inventory: any[] = [];

// Boss UI
const bossUi = document.getElementById('boss-ui')!;
const bossHpBar = document.getElementById('boss-hp-bar')!;
const bossHpText = document.getElementById('boss-hp-text')!;

// --- Colyseus Client ---
const serverUrl = import.meta.env.VITE_SERVER_URL || (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.hostname + ':2567';
const client = new Client(serverUrl);
let room: Room | undefined;

// --- Three.js Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

// Isometric Orthographic Camera
const aspect = window.innerWidth / window.innerHeight;
const d = 20; // view size
const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);

camera.position.set(20, 20, 20); // Isometric angle
camera.lookAt(scene.position); // Look at origin

const renderer = new THREE.WebGLRenderer({ antialias: false }); // Pixel art vibe
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Environment ---
// Simple grid floor
const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x888888);
scene.add(gridHelper);

// --- Entities Map ---
const entities: Record<string, THREE.Group> = {};

// --- Boss Telegraph Visual ---
const telegraphGeo = new THREE.CircleGeometry(1, 32);
const telegraphMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
const telegraphMesh = new THREE.Mesh(telegraphGeo, telegraphMat);
telegraphMesh.rotation.x = -Math.PI / 2; // Lie flat on ground
telegraphMesh.position.y = 0.05; // Slightly above ground
telegraphMesh.visible = false;
scene.add(telegraphMesh);



const lootEntities: Record<string, THREE.Mesh> = {};

function getRarityColor(rarity: string): number {
    switch (rarity) {
        case 'Common': return 0x9E9E9E;
        case 'Uncommon': return 0x4CAF50;
        case 'Rare': return 0x2196F3;
        case 'Epic': return 0x9C27B0;
        case 'Elite': return 0xFF9800;
        case 'Mythic': return 0xFF1744;
        default: return 0xffffff;
    }
}

// --- Input State ---
const keys = { w: false, a: false, s: false, d: false, ' ': false };


window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k as keyof typeof keys] = true;
    
    // Inventory toggle
    if (k === 'i') {
        if (inventoryUi.classList.contains('hidden')) {
            renderInventory();
            inventoryUi.classList.remove('hidden');
            inventoryUi.classList.add('flex');
        } else {
            inventoryUi.classList.add('hidden');
            inventoryUi.classList.remove('flex');
        }
    }

    // Blacksmith toggle
    if (k === 'b') {
        if (blacksmithUi.classList.contains('hidden')) {
            renderBlacksmith();
            blacksmithUi.classList.remove('hidden');
            blacksmithUi.classList.add('flex');
        } else {
            blacksmithUi.classList.add('hidden');
            blacksmithUi.classList.remove('flex');
        }
    }

    // Pickup
    if (k === 'e' && room) {
        for (const lootId in lootEntities) {
            room.send('pickup_item', { itemId: lootId });
        }
    }
});

closeInventoryBtn.addEventListener('click', () => {
    inventoryUi.classList.add('hidden');
    inventoryUi.classList.remove('flex');
});

closeBlacksmithBtn.addEventListener('click', () => {
    blacksmithUi.classList.add('hidden');
    blacksmithUi.classList.remove('flex');
});

function renderInventory() {
    inventoryGrid.innerHTML = '';
    inventory.forEach(item => {
        const el = document.createElement('div');
        el.className = 'bg-gray-700 p-2 rounded cursor-pointer hover:bg-gray-600 border-2 border-gray-600 flex flex-col items-center justify-center';
        
        const color = '#' + getRarityColor(item.rarity).toString(16).padStart(6, '0');
        
        let stats = `<div class="text-gray-400 text-xs">Unappraised</div>`;
        if (item.isAppraised) {
             stats = `<div class="text-[10px] text-gray-300 mt-1">Float: ${item.floatVal.toFixed(4)}<br>Pattern: #${item.patternSeed}</div>`;
        }

        el.innerHTML = `
            <div class="w-8 h-8 rounded-full mb-1 border-2 border-gray-900" style="background-color: ${color}; ${item.isAppraised ? `box-shadow: 0 0 8px ${color}` : ''}"></div>
            <div class="text-xs font-bold" style="color: ${color}">${item.rarity} Blade</div>
            ${stats}
        `;

        el.addEventListener('click', () => {
            if (item.isAppraised && room) {
                room.send('equip_item', { itemId: item.id });
                // Optimistically hide ui or show equip state
            }
        });

        inventoryGrid.appendChild(el);
    });
}

function renderBlacksmith() {
    blacksmithItems.innerHTML = '';
    const unappraised = inventory.filter(i => !i.isAppraised);
    if (unappraised.length === 0) {
        blacksmithItems.innerHTML = '<p class="text-gray-400 italic text-sm">You have no unappraised items.</p>';
        return;
    }

    unappraised.forEach(item => {
        const el = document.createElement('div');
        el.className = 'flex items-center justify-between bg-gray-700 p-2 rounded border border-gray-600';
        
        const color = '#' + getRarityColor(item.rarity).toString(16).padStart(6, '0');
        let cost = 15;
        if(item.rarity === 'Uncommon') cost = 35;
        if(item.rarity === 'Rare') cost = 75;
        if(item.rarity === 'Epic') cost = 150;
        if(item.rarity === 'Elite') cost = 300;
        if(item.rarity === 'Mythic') cost = 600;

        el.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-4 h-4 rounded-full" style="background-color: ${color}"></div>
                <span class="text-sm font-bold" style="color: ${color}">${item.rarity} Item</span>
            </div>
            <button class="bg-yellow-600 hover:bg-yellow-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                Appraise (${cost}g)
            </button>
        `;

        el.querySelector('button')!.addEventListener('click', () => {
            if (room) {
                room.send('appraise_item', { itemId: item.id });
            }
        });

        blacksmithItems.appendChild(el);
    });
}

window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k as keyof typeof keys] = false;
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('resize', () => {
    const newAspect = window.innerWidth / window.innerHeight;
    camera.left = -d * newAspect;
    camera.right = d * newAspect;
    camera.top = d;
    camera.bottom = -d;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Dodge Mechanics
let lastDodgeTime = 0;
const DODGE_COOLDOWN = 1000;
const DODGE_SPEED_MULTIPLIER = 2.5;

// --- Helper to create a Billboard Sprite ---
function createPlayerSprite(color: number, isBoss = false, name: string = "Player", id: string = "") {
    const group = new THREE.Group();

    // Shadow
    const shadowGeo = new THREE.CircleGeometry(isBoss ? 2 : 0.8, 32);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    // Sprite Group (for bobbing/flipping)
    const spriteGroup = new THREE.Group();
    spriteGroup.name = 'spriteGroup';

    // Body
    const geo = new THREE.PlaneGeometry(1, 2);
    if (isBoss) geo.scale(3, 3, 3);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = isBoss ? 3 : 1;
    mesh.name = 'body';

    // Weapon
    if (!isBoss) {
        const weaponGeo = new THREE.PlaneGeometry(0.2, 1.5);
        const weaponMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const weapon = new THREE.Mesh(weaponGeo, weaponMat);
        weapon.position.set(0.6, 1, 0.1);
        weapon.name = 'weapon';
        spriteGroup.add(weapon);
    }

    spriteGroup.add(mesh);
    group.add(spriteGroup);
    
    // UI Nameplate
    const floatingUi = document.getElementById('floating-ui')!;
    const nameplate = document.createElement('div');
    nameplate.id = `nameplate-${id}`;
    nameplate.className = 'absolute transform -translate-x-1/2 -translate-y-full text-center pointer-events-none transition-opacity duration-100';
    nameplate.innerHTML = `
        <div class="text-xs font-bold ${isBoss ? 'text-red-500 text-sm' : 'text-white drop-shadow-md'}">${name}</div>
        ${!isBoss ? `
        <div class="w-12 bg-gray-900 h-1.5 border border-gray-700 rounded-sm mt-0.5 mx-auto relative overflow-hidden">
            <div id="hp-bar-${id}" class="bg-red-500 h-full w-full"></div>
        </div>` : ''}
    `;
    floatingUi.appendChild(nameplate);

    return group;
}

function updateAura(group: THREE.Group, seed: number) {
    const weapon = group.getObjectByName('weapon') as THREE.Mesh;
    if (weapon) {
        const hue = getAuraHue(seed);
        (weapon.material as THREE.MeshBasicMaterial).color.setHSL(hue / 360, 1.0, 0.5);
    }
}

// --- Connection ---
async function connect(nickname: string) {
    try {
        room = await client.joinOrCreate("lobby", { name: nickname });
        statusEl.innerText = "Connected";
        statusEl.classList.replace('text-gray-400', 'text-green-500');


        room.state.players.onAdd((player: any, sessionId: string) => {
            // Inventory sync
            if (sessionId === room?.sessionId) {
                player.inventory.onAdd((item: any) => {
                    // Item picked up
                    inventory.push(item);
                    if (!inventoryUi.classList.contains('hidden')) renderInventory();
                    
                    item.onChange(() => {
                        // e.g. became appraised
                        if (!inventoryUi.classList.contains('hidden')) renderInventory();
                        if (!blacksmithUi.classList.contains('hidden')) renderBlacksmith();
                    });
                });
                player.inventory.onRemove((_item: any, i: number) => {
                    inventory.splice(i, 1);
                    if (!inventoryUi.classList.contains('hidden')) renderInventory();
                });
            }

            const isMe = sessionId === room?.sessionId;
            const sprite = createPlayerSprite(isMe ? 0x00ff00 : 0x0000ff, false, player.name, sessionId);
            sprite.position.set(player.x, 0, player.z);
            scene.add(sprite);
            entities[sessionId] = sprite;

            if (isMe) updateAura(sprite, 123);

            player.onChange(() => {
                const s = entities[sessionId];
                if (s && !isMe) {
                    s.position.set(player.x, 0, player.z);
                }

                if (isMe) {
                    hpText.innerText = `${Math.floor(player.hp)} / ${player.maxHp}`;
                    hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
                    staminaText.innerText = `${Math.floor(player.stamina)} / 100`;
                    staminaBar.style.width = `${player.stamina}%`;
                    goldText.innerText = player.gold.toString();
                }

                const remoteHpBar = document.getElementById(`hp-bar-${sessionId}`);
                if (remoteHpBar) {
                    remoteHpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
                }

                // Visual feedback for dodging
                const spriteGroup = s?.getObjectByName('spriteGroup') as THREE.Group;
                const bodyMesh = spriteGroup?.getObjectByName('body') as THREE.Mesh;
                if(bodyMesh) {
                     const mat = bodyMesh.material as THREE.MeshBasicMaterial;
                     if(player.isDodging) {
                         mat.transparent = true;
                         mat.opacity = 0.4;
                     } else {
                         mat.transparent = false;
                         mat.opacity = 1.0;
                     }
                }
            });
        });

        room.state.players.onRemove((_player: any, sessionId: string) => {
            if (entities[sessionId]) {
                scene.remove(entities[sessionId]);
                delete entities[sessionId];
                const np = document.getElementById(`nameplate-${sessionId}`);
                if (np) np.remove();
            }
        });


        room.state.lootDrops.onAdd((drop: any, id: string) => {
            if (drop.ownerId !== room?.sessionId) return; // Only show my loot

            const geo = new THREE.CylinderGeometry(0.2, 0.2, 5, 8);
            const mat = new THREE.MeshBasicMaterial({ 
                color: getRarityColor(drop.rarity), 
                transparent: true, 
                opacity: 0.6,
                blending: THREE.AdditiveBlending 
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(drop.x, 2.5, drop.z); // Start from ground up
            scene.add(mesh);
            lootEntities[id] = mesh;
        });

        room.state.lootDrops.onRemove((_drop: any, id: string) => {
            if (lootEntities[id]) {
                scene.remove(lootEntities[id]);
                delete lootEntities[id];
            }
        });

        room.state.boss.onChange(() => {
            const bossState = room!.state.boss;
            let bossSprite = entities['boss'];
            if (!bossSprite) {
                bossSprite = createPlayerSprite(0xff0000, true, "Crypt Guardian", "boss");
                scene.add(bossSprite);
                entities['boss'] = bossSprite;
            }
            bossSprite.position.set(bossState.x, 0, bossState.z);

            // Boss UI
            if (bossState.hp > 0) {
                bossUi.classList.remove('hidden');
                bossUi.classList.add('flex');
                bossHpText.innerText = `${Math.floor(bossState.hp)} / ${bossState.maxHp}`;
                bossHpBar.style.width = `${(bossState.hp / bossState.maxHp) * 100}%`;
            } else {
                bossUi.classList.add('hidden');
                bossUi.classList.remove('flex');
            }

            const sg = bossSprite.getObjectByName('spriteGroup') as THREE.Group;
            const mesh = sg.getObjectByName('body') as THREE.Mesh;
            if (bossState.phase === 'enraged') {
                (mesh.material as THREE.MeshBasicMaterial).color.setHex(0xffaa00);
            } else {
                (mesh.material as THREE.MeshBasicMaterial).color.setHex(0xff0000);
            }

            if (bossState.isTelegraphing) {
                telegraphMesh.visible = true;
                telegraphMesh.position.set(bossState.telegraphPositionX, 0.05, bossState.telegraphPositionZ);
                telegraphMesh.scale.set(bossState.telegraphRadius, bossState.telegraphRadius, 1);
            } else {
                telegraphMesh.visible = false;
            }
        });

                room.onMessage("damage_text", (data) => {
            createDamageText(data.x, data.y, data.z, data.amount, data.isCrit);
        });
        
        room.onMessage("loot_drop", (loot) => {
            console.log("Loot Dropped!", loot);
        });

    } catch (e) {
        console.error("JOIN ERROR", e);
        statusEl.innerText = "Connection failed";
        statusEl.classList.replace('text-gray-400', 'text-red-500');
    }
}

playBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim() || "Player";
    startMenu.classList.add('hidden');
    gameUi.classList.remove('hidden');
    connect(nickname);
});


// --- Combat & Visuals ---
const floatingUi = document.getElementById('floating-ui')!;

function createDamageText(x: number, y: number, z: number, amount: number, isCrit: boolean) {
    const el = document.createElement('div');
    el.innerText = amount.toString();
    el.className = `absolute transform -translate-x-1/2 -translate-y-1/2 font-bold pointer-events-none select-none transition-all duration-1000 ease-out z-50 ${isCrit ? 'text-yellow-400 text-3xl drop-shadow-md' : 'text-white text-xl drop-shadow'}`;
    
    // Initial position
    const pos = new THREE.Vector3(x, y, z);
    pos.project(camera);
    const px = (pos.x * .5 + .5) * window.innerWidth;
    let py = (pos.y * -.5 + .5) * window.innerHeight;
    
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    floatingUi.appendChild(el);

    // Animate up and fade out
    let startTime = performance.now();
    function animStep() {
        const t = performance.now() - startTime;
        if (t > 1000) {
            el.remove();
            return;
        }
        py -= 1; // move up
        el.style.top = `${py}px`;
        el.style.opacity = (1 - t / 1000).toString();
        requestAnimationFrame(animStep);
    }
    requestAnimationFrame(animStep);
}

function spawnSlashArc(x: number, z: number, angle: number, isMe: boolean) {
    const geo = new THREE.RingGeometry(2, 3.5, 16, 1, 0, Math.PI / 2); // 90 degree arc
    const mat = new THREE.MeshBasicMaterial({ color: isMe ? 0xffffff : 0x888888, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    
    mesh.position.set(x, 1, z);
    mesh.rotation.x = -Math.PI / 2; // Flat on ground
    
    // The geometry arc starts at X axis and goes counter-clockwise.
    // We want the arc to be centered around the aim angle.
    // So we rotate Z by angle, then subtract PI/4 (half of PI/2 arc) to center it.
    mesh.rotation.z = angle - Math.PI / 4; 

    scene.add(mesh);

    // Fade out quickly
    let startTime = performance.now();
    function animStep() {
        const t = performance.now() - startTime;
        if (t > 200) {
            scene.remove(mesh);
            geo.dispose();
            mat.dispose();
            return;
        }
        mesh.scale.set(1 + t/200 * 0.2, 1 + t/200 * 0.2, 1);
        mat.opacity = 0.8 * (1 - t / 200);
        requestAnimationFrame(animStep);
    }
    requestAnimationFrame(animStep);
}

window.addEventListener('mousedown', (e) => {
    // Left click attack
    if (e.button === 0 && room && !startMenu.classList.contains('hidden') === false) {
        const me = entities[room.sessionId];
        if (me) {
            // Get aim angle
            raycaster.setFromCamera(mouse, camera);
            const intersectPoint = new THREE.Vector3();
            let aimAngle = 0;
            if (raycaster.ray.intersectPlane(floorPlane, intersectPoint)) {
                const adx = intersectPoint.x - me.position.x;
                const adz = intersectPoint.z - me.position.z;
                aimAngle = Math.atan2(adz, adx);
            }
            
            room.send('attack', { angle: aimAngle });
            spawnSlashArc(me.position.x, me.position.z, aimAngle, true);
        }
    }
});


// --- Main Loop ---
let lastTime = performance.now();
const BASE_SPEED = 10;
let isLocallyDodging = false;
let dodgeDir = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Movement & Aiming
    if (room && room.sessionId && entities[room.sessionId]) {
        const me = entities[room.sessionId];
        const serverPlayer = room.state.players.get(room.sessionId);

        let currentSpeed = BASE_SPEED;

        // Handle Dodge Input
        if (keys[' '] && now - lastDodgeTime > DODGE_COOLDOWN && serverPlayer && serverPlayer.stamina >= 30) {
            lastDodgeTime = now;
            room.send('dodge');
            isLocallyDodging = true;

            // Determine dodge direction
            let dx = 0, dz = 0;
            if (keys.w) { dx -= 1; dz -= 1; }
            if (keys.s) { dx += 1; dz += 1; }
            if (keys.a) { dx -= 1; dz += 1; }
            if (keys.d) { dx += 1; dz -= 1; }

            if (dx === 0 && dz === 0) {
                // If not moving, dodge backwards from mouse aim
                raycaster.setFromCamera(mouse, camera);
                const intersectPoint = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(floorPlane, intersectPoint)) {
                    dx = me.position.x - intersectPoint.x;
                    dz = me.position.z - intersectPoint.z;
                }
            }

            dodgeDir.set(dx, 0, dz).normalize();

            setTimeout(() => {
                isLocallyDodging = false;
            }, 250); // Dodge duration 0.25s
        }

        let dx = 0;
        let dz = 0;

        if (isLocallyDodging) {
             currentSpeed = BASE_SPEED * DODGE_SPEED_MULTIPLIER;
             dx = dodgeDir.x;
             dz = dodgeDir.z;
        } else {
            // Simple WASD
            if (keys.w) { dx -= 1; dz -= 1; } // isometric up
            if (keys.s) { dx += 1; dz += 1; } // isometric down
            if (keys.a) { dx -= 1; dz += 1; } // isometric left
            if (keys.d) { dx += 1; dz -= 1; } // isometric right

            if (dx !== 0 || dz !== 0) {
                const len = Math.sqrt(dx * dx + dz * dz);
                dx /= len;
                dz /= len;
            }
        }

        if (dx !== 0 || dz !== 0) {
            me.position.x += dx * currentSpeed * dt;
            me.position.z += dz * currentSpeed * dt;
            room.send('move', { x: me.position.x, z: me.position.z, rotation: 0 }); // Ignoring rotation for move payload for now
        }

        // Mouse aim rotation (Client side visual)
        raycaster.setFromCamera(mouse, camera);
        const intersectPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(floorPlane, intersectPoint)) {
            // we could rotate a weapon or body here based on aim
        }

        // Update Camera to follow player
        camera.position.x = me.position.x + 20;
        camera.position.z = me.position.z + 20;
    }

    // Billboard effect (all sprites face camera)
    for (const key in entities) {
        entities[key].quaternion.copy(camera.quaternion);
    }

    renderer.render(scene, camera);
}

animate();

