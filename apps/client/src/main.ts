import './style.css';
import * as THREE from 'three';
import { Client, Room } from 'colyseus.js';
import { getAuraHue } from '@medieval-patterns/shared';

// --- UI Elements ---
const statusEl = document.getElementById('status')!;

// --- Colyseus Client ---
const client = new Client('ws://localhost:2567');
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

// --- Input State ---
const keys = { w: false, a: false, s: false, d: false };

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase() as keyof typeof keys] = true;
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase() as keyof typeof keys] = false;
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

// --- Helper to create a Billboard Sprite ---
function createPlayerSprite(color: number, isBoss = false) {
    const group = new THREE.Group();

    // Body
    const geo = new THREE.PlaneGeometry(1, 2);
    if (isBoss) geo.scale(3, 3, 3);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = isBoss ? 3 : 1; // Half height
    
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

            // Optional: fake a weapon aura for demo
            if (isMe) updateAura(sprite, 123);

            player.onChange(() => {
                const s = entities[sessionId];
                if (s && !isMe) {
                    s.position.set(player.x, 0, player.z);
                    // Rotation would affect sprite flipping or weapon rotation
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
            
            // simple visual cue for enrage
            const mesh = bossSprite.children[0] as THREE.Mesh;
            if (bossState.phase === 'enraged') {
                (mesh.material as THREE.MeshBasicMaterial).color.setHex(0xffaa00);
            } else {
                (mesh.material as THREE.MeshBasicMaterial).color.setHex(0xff0000);
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
const SPEED = 10;

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Movement & Aiming
    if (room && room.sessionId && entities[room.sessionId]) {
        const me = entities[room.sessionId];
        
        // Simple WASD
        let dx = 0;
        let dz = 0;
        if (keys.w) { dx -= 1; dz -= 1; } // isometric up
        if (keys.s) { dx += 1; dz += 1; } // isometric down
        if (keys.a) { dx -= 1; dz += 1; } // isometric left
        if (keys.d) { dx += 1; dz -= 1; } // isometric right

        // Normalize
        if (dx !== 0 || dz !== 0) {
            const len = Math.sqrt(dx * dx + dz * dz);
            dx /= len;
            dz /= len;
        }

        me.position.x += dx * SPEED * dt;
        me.position.z += dz * SPEED * dt;

        // Mouse aim rotation
        raycaster.setFromCamera(mouse, camera);
        const intersectPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(floorPlane, intersectPoint)) {
            const angle = Math.atan2(intersectPoint.x - me.position.x, intersectPoint.z - me.position.z);
            // Send state to server
            room.send('move', { x: me.position.x, z: me.position.z, rotation: angle });
        } else {
             room.send('move', { x: me.position.x, z: me.position.z, rotation: 0 });
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
