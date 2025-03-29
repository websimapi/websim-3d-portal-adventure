import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createPortal } from './portal.js';

let camera, scene, renderer, controls;
let player; // Represents the player capsule
let playerVelocity = new THREE.Vector3();
let playerDirection = new THREE.Vector3();
let playerOnFloor = false;
const playerHeight = 1.8;
const playerRadius = 0.5;
const playerSpeed = 5; // units per second
const playerJumpForce = 8;

const moveForward = { value: false };
const moveBackward = { value: false };
const moveLeft = { value: false };
const moveRight = { value: false };
const canJump = { value: false };

let worldObjects = []; // Store collidable objects
let startPortalGroup, startPortalBox;
let exitPortalGroup, exitPortalBox;

const clock = new THREE.Clock();

// Reference URL for the return portal
let refUrl = null;
let selfUsername = 'Player' + Math.floor(Math.random() * 1000); // Default username

const SPAWN_POINT = new THREE.Vector3(0, 5, 0); // Initial spawn point
const START_PORTAL_POS = new THREE.Vector3(0, 5, -10); // Position for the start/return portal
const EXIT_PORTAL_POS = new THREE.Vector3(0, 5, 30); // Position for the exit portal

init();
animate();

function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const cameFromPortal = urlParams.get('portal') === 'true';
    refUrl = urlParams.get('ref');
    const urlUsername = urlParams.get('username');
    if (urlUsername) {
        selfUsername = urlUsername;
    }

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 150);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    if (cameFromPortal && refUrl) {
        // Spawn near the start portal if coming from another game
        camera.position.copy(START_PORTAL_POS).add(new THREE.Vector3(0, 0, 5)); // Start slightly in front of the portal
    } else {
        camera.position.copy(SPAWN_POINT);
    }


    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Player representation (invisible capsule)
    // We don't add a visible mesh for the player itself in first-person
    // Instead, the camera represents the player's eyes.
    // We will use a bounding box for collision detection centered around the camera.


    // Controls
    controls = new PointerLockControls(camera, document.body);
    scene.add(controls.getObject());

    const blocker = document.getElementById('info'); // Use info div as blocker initially
    blocker.addEventListener('click', function () {
        controls.lock();
    });

    controls.addEventListener('lock', function () {
        blocker.style.display = 'none';
    });

    controls.addEventListener('unlock', function () {
        blocker.style.display = 'block';
    });


    // Floor
    const floorGeometry = new THREE.PlaneGeometry(300, 300, 100, 100);
    floorGeometry.rotateX(-Math.PI / 2);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 }); // Green grass color
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    scene.add(floor);
    worldObjects.push(floor); // Add floor to collidable objects


    // Simple obstacles
    const boxGeometry = new THREE.BoxGeometry(5, 5, 5);
    const boxMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown color
    for (let i = 0; i < 10; i++) {
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        box.position.set(
            Math.random() * 100 - 50,
            2.5, // Positioned on the floor
            Math.random() * 100 - 50
        );
        scene.add(box);
        worldObjects.push(box);
    }


    // --- Portals ---
    // Exit Portal (always present)
    const exitPortalResult = createPortal(scene, EXIT_PORTAL_POS, 0x00ff00, 'VIBEVERSE PORTAL'); // Green
    exitPortalGroup = exitPortalResult.group;
    exitPortalBox = exitPortalResult.box;

    // Start/Return Portal (only if coming from another game via portal)
    if (cameFromPortal && refUrl) {
        const returnLabel = `Return to ${new URL('https://' + refUrl.replace(/^(https?:\/\/)/,'')).hostname}`; // Basic label from ref
        const startPortalResult = createPortal(scene, START_PORTAL_POS, 0xff0000, returnLabel); // Red
        startPortalGroup = startPortalResult.group;
        startPortalBox = startPortalResult.box;
    }


    // Keyboard Input
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Resize listener
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward.value = true;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft.value = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward.value = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight.value = true;
            break;
        case 'Space':
            if (canJump.value === true) playerVelocity.y = playerJumpForce;
            canJump.value = false;
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward.value = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft.value = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward.value = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight.value = false;
            break;
    }
}

function updatePlayer(deltaTime) {
    let speedDelta = deltaTime * playerSpeed * (playerOnFloor ? 1 : 0.3); // Slower movement in air

    // Reset velocity influencing factors
    playerVelocity.x -= playerVelocity.x * 10.0 * deltaTime; // Air resistance / damping x
    playerVelocity.z -= playerVelocity.z * 10.0 * deltaTime; // Air resistance / damping z
    playerVelocity.y -= 9.8 * 10.0 * deltaTime; // Gravity (scaled)

    playerDirection.z = Number(moveForward.value) - Number(moveBackward.value);
    playerDirection.x = Number(moveRight.value) - Number(moveLeft.value);
    playerDirection.normalize(); // Ensure consistent movement speed in all directions

    if (moveForward.value || moveBackward.value) playerVelocity.z -= playerDirection.z * speedDelta * 100; // Increased multiplier for responsiveness
    if (moveLeft.value || moveRight.value) playerVelocity.x -= playerDirection.x * speedDelta * 100; // Increased multiplier for responsiveness


    // Apply movement based on controls look direction
    const moveVec = new THREE.Vector3(playerVelocity.x * deltaTime, playerVelocity.y * deltaTime, playerVelocity.z * deltaTime);
    controls.moveRight(-moveVec.x / 50); // Adjusted divisor
    controls.moveForward(-moveVec.z / 50); // Adjusted divisor


    // Update player position directly based on controls' internal movement
    controls.getObject().position.y += moveVec.y;


    // Simple floor collision
    if (controls.getObject().position.y < playerHeight / 2) {
        playerVelocity.y = 0;
        controls.getObject().position.y = playerHeight / 2;
        canJump.value = true;
        playerOnFloor = true;
    } else {
        playerOnFloor = false;
    }

    // Basic Collision detection (Simplified AABB vs AABB) - More robust needed for real game
    // Create a bounding box for the player based on camera position
    const playerBox = new THREE.Box3(
        new THREE.Vector3(
            controls.getObject().position.x - playerRadius,
            controls.getObject().position.y - playerHeight / 2,
            controls.getObject().position.z - playerRadius
        ),
        new THREE.Vector3(
            controls.getObject().position.x + playerRadius,
            controls.getObject().position.y + playerHeight / 2,
            controls.getObject().position.z + playerRadius
        )
    );


    worldObjects.forEach(obj => {
        if (obj !== floor) { // Don't collide with floor this way
             const objBox = new THREE.Box3().setFromObject(obj);
             if (playerBox.intersectsBox(objBox)) {
                 // Very basic collision response: Stop movement towards the object
                 // This is highly simplified and can cause issues. A better physics engine is recommended.

                 // Determine collision normal (approximate)
                 const playerCenter = playerBox.getCenter(new THREE.Vector3());
                 const objCenter = objBox.getCenter(new THREE.Vector3());
                 const collisionNormal = playerCenter.sub(objCenter).normalize();

                 // Project velocity onto the normal and negate it to push player back slightly
                 const pushback = collisionNormal.multiplyScalar(playerVelocity.length() * deltaTime * 1.1); // Push back a bit more than move distance
                 controls.getObject().position.add(pushback);

                 // Dampen velocity significantly on collision
                 playerVelocity.multiplyScalar(0.5);
             }
        }
    });


}

function checkPortals() {
     // Player position as a point for distance check
    const playerPosition = controls.getObject().position;

    // Create a small box around the player's feet for intersection check
    const playerFeetBox = new THREE.Box3(
        new THREE.Vector3(playerPosition.x - 0.1, playerPosition.y - 0.2, playerPosition.z - 0.1),
        new THREE.Vector3(playerPosition.x + 0.1, playerPosition.y, playerPosition.z + 0.1)
    );


    // Check Start/Return Portal
    if (startPortalGroup && startPortalBox) {
        const portalCenter = startPortalBox.getCenter(new THREE.Vector3());
        const distance = playerPosition.distanceTo(portalCenter);

        if (distance < 20) { // Increased range for detection before actual intersection
             // Check for actual intersection
             if (playerFeetBox.intersectsBox(startPortalBox)) {
                 if (refUrl) {
                     console.log("Entering return portal to:", refUrl);
                     let returnUrl = refUrl;
                     if (!returnUrl.startsWith('http://') && !returnUrl.startsWith('https://')) {
                         returnUrl = 'https://' + returnUrl;
                     }
                     const currentParams = new URLSearchParams(window.location.search);
                     const newParams = new URLSearchParams();
                     newParams.set('portal', 'true');
                     newParams.set('username', selfUsername);
                     newParams.set('color', 'blue'); // Example color
                     newParams.set('speed', playerSpeed.toString());
                     newParams.set('ref', window.location.host + window.location.pathname); // Add self as ref

                     // Carry over other relevant params if needed
                      // currentParams.forEach((value, key) => {
                      //   if (key !== 'ref' && key !== 'portal' && key !== 'username' /* etc */) {
                      //     newParams.append(key, value);
                      //   }
                      // });

                     window.location.href = returnUrl + (newParams.toString() ? '?' + newParams.toString() : '');
                     controls.unlock(); // Prevent further movement
                     return; // Stop further checks this frame
                 }
             }
        }

    }

    // Check Exit Portal
    if (exitPortalGroup && exitPortalBox) {
        const portalCenter = exitPortalBox.getCenter(new THREE.Vector3());
        const distance = playerPosition.distanceTo(portalCenter);

         if (distance < 20) { // Increased range for preload/detection
             const nextPage = 'https://portal.pieter.com';
             const currentParams = new URLSearchParams(window.location.search);
             const newParams = new URLSearchParams();

             newParams.set('portal', 'true');
             newParams.set('username', selfUsername);
             newParams.set('color', 'green'); // Example color
             newParams.set('speed', playerSpeed.toString());
             // Add velocity components if needed
             // newParams.set('speed_x', playerVelocity.x.toFixed(2));
             // newParams.set('speed_y', playerVelocity.y.toFixed(2));
             // newParams.set('speed_z', playerVelocity.z.toFixed(2));
             // Add rotation if needed (using camera quaternion)
             // const camQuat = camera.quaternion;
             // newParams.set('rotation_x', camQuat.x.toFixed(4));
             // newParams.set('rotation_y', camQuat.y.toFixed(4));
             // newParams.set('rotation_z', camQuat.z.toFixed(4));
             // newParams.set('rotation_w', camQuat.w.toFixed(4)); // Often need W too
             newParams.set('ref', window.location.host + window.location.pathname); // Add self as ref

             // Carry over other relevant params if needed
             // currentParams.forEach((value, key) => {
             //   if (key !== 'ref' && key !== 'portal' && key !== 'username' /* etc */) {
             //     newParams.append(key, value);
             //   }
             // });

             const paramString = newParams.toString();
             const preloadUrl = nextPage + (paramString ? '?' + paramString : '');


             // Preload attempt (simple iframe)
             let iframe = document.getElementById('preloadFrame');
             if (!iframe) {
                 iframe = document.createElement('iframe');
                 iframe.id = 'preloadFrame';
                 iframe.style.display = 'none';
                 iframe.src = preloadUrl; // Start loading
                 document.body.appendChild(iframe);
                 console.log("Preloading exit portal target:", preloadUrl);
             } else if (iframe.src !== preloadUrl) {
                 iframe.src = preloadUrl; // Update src if params changed significantly (optional)
             }


            // Check for actual intersection
            if (playerFeetBox.intersectsBox(exitPortalBox)) {
                 console.log("Entering exit portal!");
                 window.location.href = preloadUrl; // Redirect using the preloaded URL
                 controls.unlock(); // Prevent further movement
                 return; // Stop further checks this frame
            }
        }
    }

}


function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    if (controls.isLocked === true) {
        updatePlayer(deltaTime);
        checkPortals(); // Check portal proximity and entry
    }

    // Animate portals (particles, etc.) - Can be moved inside portal.js if complex
    if (startPortalGroup) {
         // Simple rotation example
         startPortalGroup.rotation.y += 0.005;
         // Add particle animation here if needed, or call from portal.js
    }
     if (exitPortalGroup) {
         exitPortalGroup.rotation.y -= 0.005;
          // Add particle animation here if needed, or call from portal.js
    }


    renderer.render(scene, camera);
}

