import './style.css';
import * as THREE from 'three';
import { Client, Room } from 'colyseus.js';
import { getAuraHue } from '@medieval-patterns/shared';

// --- UI Elements ---
const statusEl = document.getElementById('status')!;
const staminaEl = document.getElementById('stamina')!;
const hpEl = document.getElementById('hp')!;

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


// --- Input State ---
const keys = { w: false, a: false, s: false, d: false, ' ': false };

window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k as keyof typeof keys] = true;
});
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
function createPlayerSprite(color: number, isBoss = false) {
    const group = new THREE.Group();

    // Body
    const geo = new THREE.PlaneGeometry(1, 2);
    if (isBoss) geo.scale(3, 3, 3);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = isBoss ? 3 : 1; // Half height
    mesh.name = 'body';
    
    // Weapon (Procedural Placeholder)
    if (!isBoss) {
        const weaponGeo = new THREE.PlaneGeometry(0.2, 1.5);
        const weaponMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const weapon = new THREE.Mesh(weaponGeo, weaponMat);
        weapon.position.set(0.6, 1, 0.1);
        weapon.name = 'weapon';
        group.add(weapon);
    }

    group.add(mesh);
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
async function connect() {
    try {
        room = await client.joinOrCreate("lobby");
        statusEl.innerText = "Connected to Lobby";
        statusEl.classList.replace('text-gray-400', 'text-green-500');

        room.state.players.onAdd((player: any, sessionId: string) => {
            const isMe = sessionId === room?.sessionId;
            const sprite = createPlayerSprite(isMe ? 0x00ff00 : 0x0000ff);
            sprite.position.set(player.x, 0, player.z);
            scene.add(sprite);
            entities[sessionId] = sprite;

            if (isMe) updateAura(sprite, 123);

            player.onChange(() => {
                const s = entities[sessionId];
                if (s && !isMe) {
                    // Very simple lerp for remote players could go here
                    s.position.set(player.x, 0, player.z);
                }
                
                if (isMe) {
                    if(staminaEl) staminaEl.innerText = `Stamina: ${Math.floor(player.stamina)}`;
                    if(hpEl) hpEl.innerText = `HP: ${player.hp}`;
                }
                
                // Visual feedback for dodging (ghost effect)
                const bodyMesh = s?.getObjectByName('body') as THREE.Mesh;
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
            }
        });

        room.state.boss.onChange(() => {
            const bossState = room!.state.boss;
            let bossSprite = entities['boss'];
            if (!bossSprite) {
                bossSprite = createPlayerSprite(0xff0000, true);
                scene.add(bossSprite);
                entities['boss'] = bossSprite;
            }
            bossSprite.position.set(bossState.x, 0, bossState.z);
            
            // Visual cue for enrage
            const mesh = bossSprite.children[0] as THREE.Mesh;
            if (bossState.phase === 'enraged') {
                (mesh.material as THREE.MeshBasicMaterial).color.setHex(0xffaa00);
            } else {
                (mesh.material as THREE.MeshBasicMaterial).color.setHex(0xff0000);
            }
            
            // Telegraphing
            if (bossState.isTelegraphing) {
                telegraphMesh.visible = true;
                telegraphMesh.position.set(bossState.telegraphPositionX, 0.05, bossState.telegraphPositionZ);
                telegraphMesh.scale.set(bossState.telegraphRadius, bossState.telegraphRadius, 1);
            } else {
                telegraphMesh.visible = false;
            }
        });

        room.onMessage("loot_drop", (loot) => {
            console.log("Loot Dropped!", loot);
            alert(`Loot dropped! Rarity: ${loot.rarity}, Float: ${loot.floatVal.toFixed(4)}, Pattern: #${loot.patternSeed}`);
        });

    } catch (e) {
        console.error("JOIN ERROR", e);
        statusEl.innerText = "Connection failed";
        statusEl.classList.replace('text-gray-400', 'text-red-500');
    }
}

connect();

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

// Add HP/Stamina UI elements
const uiContainer = document.querySelector('.p-4')!;
const hpNode = document.createElement('p');
hpNode.id = 'hp';
hpNode.className = 'text-red-400 font-bold mt-2';
hpNode.innerText = 'HP: 100';
uiContainer.appendChild(hpNode);

const stNode = document.createElement('p');
stNode.id = 'stamina';
stNode.className = 'text-green-400 font-bold';
stNode.innerText = 'Stamina: 100';
uiContainer.appendChild(stNode);

// Debug: Attack Boss on Click
window.addEventListener('mousedown', (e) => {
    if (e.button === 0 && room) {
        room.send('attack_boss', { damage: 100 });
    }
});
