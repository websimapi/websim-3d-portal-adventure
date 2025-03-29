import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createPortal } from './portal.js';

let camera, scene, renderer, controls;
let player; // Represents the player capsule
let playerVelocity = new THREE.Vector3();
let playerOnFloor = false;
const playerHeight = 1.8; // Assume camera is at this height from player's feet
const playerRadius = 0.5;
const playerSpeed = 5; // units per second
const playerJumpForce = 8;
const gravity = 30; // Adjusted gravity force (units/s^2)

const moveForward = { value: false };
const moveBackward = { value: false };
const moveLeft = { value: false };
const moveRight = { value: false };
const canJump = { value: false };

let worldObjects = []; // Store collidable objects
let startPortalInfo = null; // Will store { group, box, animate }
let exitPortalInfo = null; // Will store { group, box, animate }

const clock = new THREE.Clock();

// Reference URL for the return portal
let refUrl = null;
let selfUsername = 'Player' + Math.floor(Math.random() * 1000); // Default username

// Adjust spawn/portal positions based on playerHeight
const SPAWN_POINT = new THREE.Vector3(0, playerHeight, 0); // Start with feet on ground
const START_PORTAL_POS = new THREE.Vector3(0, playerHeight, -10); // Center portal roughly at player eye level
const EXIT_PORTAL_POS = new THREE.Vector3(0, playerHeight, 30); // Center portal roughly at player eye level

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
    // Position camera at player height
    camera.position.y = playerHeight;

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

    // Player representation (invisible capsule) is handled by the camera + collision logic

    // Controls
    controls = new PointerLockControls(camera, document.body);
    // Move controls object to the spawn point
    if (cameFromPortal && refUrl) {
        // Spawn near the start portal if coming from another game
        controls.getObject().position.copy(START_PORTAL_POS).add(new THREE.Vector3(0, 0, 5)); // Start slightly in front of the portal
        // Ensure y position is correct player height
        controls.getObject().position.y = playerHeight;
    } else {
        controls.getObject().position.copy(SPAWN_POINT);
    }
    scene.add(controls.getObject()); // Add camera group managed by controls to the scene

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
            2.5, // Positioned on the floor (center y = half height)
            Math.random() * 100 - 50
        );
        scene.add(box);
        worldObjects.push(box);
    }

    // --- Portals ---
    // Exit Portal (always present)
    const exitPortalData = createPortal(scene, EXIT_PORTAL_POS, 0x00ff00, 'VIBEVERSE PORTAL'); // Green
    scene.add(exitPortalData.group); // Add group to scene first
    exitPortalData.group.updateMatrixWorld(true); // Ensure transforms are calculated
    const exitPortalBox = new THREE.Box3().setFromObject(exitPortalData.group); // Calculate box *after* adding
    exitPortalInfo = { ...exitPortalData, box: exitPortalBox };

    // Start/Return Portal (only if coming from another game via portal)
    if (cameFromPortal && refUrl) {
        const returnLabel = `Return to ${new URL('https://' + refUrl.replace(/^(https?:\/\/)/,'')).hostname}`; // Basic label from ref
        const startPortalData = createPortal(scene, START_PORTAL_POS, 0xff0000, returnLabel); // Red
        scene.add(startPortalData.group); // Add group to scene first
        startPortalData.group.updateMatrixWorld(true); // Ensure transforms are calculated
        const startPortalBox = new THREE.Box3().setFromObject(startPortalData.group); // Calculate box *after* adding
        startPortalInfo = { ...startPortalData, box: startPortalBox };
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
            playerOnFloor = false; // Assume leaving floor on jump
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
    const speedDelta = deltaTime * playerSpeed; // Base speed calculation

    // Store current position before movement attempt
    const previousPosition = controls.getObject().position.clone();

    // Apply gravity
    if (!playerOnFloor) {
        playerVelocity.y -= gravity * deltaTime;
    }

    // Horizontal movement damping (air/ground friction)
    // This prevents infinite sliding. Applied *before* adding new movement input.
    // We apply damping directly to the controls object's velocity conceptually.
    // PointerLockControls doesn't expose velocity, so we simulate damping by reducing movement input.
    // A simpler approach: Use playerVelocity for Y only and apply X/Z movement directly.
    playerVelocity.x *= (1 - 10 * deltaTime); // Damp horizontal velocity
    playerVelocity.z *= (1 - 10 * deltaTime); // Damp horizontal velocity

    // Apply movement inputs directly using controls.moveForward/moveRight
    // These methods move relative to the camera's current direction
    if (moveForward.value) controls.moveForward(speedDelta);
    if (moveBackward.value) controls.moveForward(-speedDelta);
    if (moveRight.value) controls.moveRight(speedDelta);
    if (moveLeft.value) controls.moveRight(-speedDelta);

    // Apply vertical velocity
    controls.getObject().position.y += playerVelocity.y * deltaTime;

    // --- Collision Detection & Response ---

    // 1. Floor Collision
    if (controls.getObject().position.y < playerHeight) {
        playerVelocity.y = 0;
        controls.getObject().position.y = playerHeight; // Place feet exactly on floor
        canJump.value = true;
        playerOnFloor = true;
    } else {
        playerOnFloor = false;
        // canJump should already be false unless jump was just initiated
    }

    // 2. World Object Collision (Basic)
    // Create player bounding box based on *potential* new position
    const playerBox = new THREE.Box3(
        new THREE.Vector3(
            controls.getObject().position.x - playerRadius,
            controls.getObject().position.y - playerHeight, // Bottom of player (feet)
            controls.getObject().position.z - playerRadius
        ),
        new THREE.Vector3(
            controls.getObject().position.x + playerRadius,
            controls.getObject().position.y, // Top of player (eyes/camera)
            controls.getObject().position.z + playerRadius
        )
    );

    worldObjects.forEach(obj => {
        if (obj !== floor) { // Don't collide with floor this way
            const objBox = new THREE.Box3().setFromObject(obj);
            if (playerBox.intersectsBox(objBox)) {
                // Collision occurred!
                // Very basic response: Reset position to before this frame's movement.
                // This prevents phasing through but feels abrupt. A better system
                // would slide the player along the collision surface.
                // console.log("Collision detected!"); // DEBUG
                controls.getObject().position.copy(previousPosition);

                // Optionally, zero out velocity component that caused collision
                // This requires more complex intersection analysis.
                // For simplicity, just stopping movement for this frame.
                playerVelocity.y = Math.max(0, playerVelocity.y); // Prevent gravity build-up if stuck under something
            }
        }
    });
}

function checkPortals() {
    // Player position (camera position)
    const playerPosition = controls.getObject().position;

    // Create a small box centered around the player's assumed feet position
    const feetY = playerPosition.y - playerHeight + 0.1; // Slightly above ground
    const playerFeetBox = new THREE.Box3(
        new THREE.Vector3(playerPosition.x - playerRadius * 0.5, feetY - 0.1, playerPosition.z - playerRadius * 0.5),
        new THREE.Vector3(playerPosition.x + playerRadius * 0.5, feetY + 0.1, playerPosition.z + playerRadius * 0.5)
    );

    // Check Start/Return Portal
    if (startPortalInfo && startPortalInfo.box) { // Ensure box is calculated
        const portalCenter = startPortalInfo.box.getCenter(new THREE.Vector3());
        const distance = playerPosition.distanceTo(portalCenter);
        const interactionDistance = 5; // Radius of portal torus + buffer

        // Check proximity first (cheaper)
        if (distance < interactionDistance + 2) {
            // Check for actual intersection with feet box
            if (playerFeetBox.intersectsBox(startPortalInfo.box)) {
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
                    // Add other params from original entry if needed (color, etc.)
                    // Example: if(currentParams.has('color')) newParams.set('color', currentParams.get('color'));
                    newParams.set('ref', window.location.host + window.location.pathname); // Add self as ref

                    window.location.href = returnUrl + (newParams.toString() ? '?' + newParams.toString() : '');
                    controls.unlock(); // Prevent further movement
                    return true; // Indicate portal was entered
                }
            }
        }
    }

    // Check Exit Portal
    if (exitPortalInfo && exitPortalInfo.box) { // Ensure box is calculated
        const portalCenter = exitPortalInfo.box.getCenter(new THREE.Vector3());
        const distance = playerPosition.distanceTo(portalCenter);
        const interactionDistance = 5; // Radius of portal torus + buffer
        const preloadDistance = 20; // Distance at which to start preloading

        if (distance < preloadDistance) {
            const nextPage = 'https://portal.pieter.com';
            const currentParams = new URLSearchParams(window.location.search);
            const newParams = new URLSearchParams();

            newParams.set('portal', 'true');
            newParams.set('username', selfUsername);
            newParams.set('color', 'green'); // Example color
            newParams.set('speed', playerSpeed.toString());
            // Add velocity/rotation if desired
            // const camQuat = camera.quaternion;
            // ... add quat components ...
            newParams.set('ref', window.location.host + window.location.pathname); // Add self as ref

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
                iframe.src = preloadUrl; // Update src if params changed (optional)
            }

            // Check for actual intersection only if closer
            if (distance < interactionDistance + 2) {
                if (playerFeetBox.intersectsBox(exitPortalInfo.box)) {
                    console.log("Entering exit portal!");
                    window.location.href = preloadUrl; // Redirect using the preloaded URL
                    controls.unlock(); // Prevent further movement
                    return true; // Indicate portal was entered
                }
            }
        }
    }
    return false; // No portal entered
}

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = Math.min(0.1, clock.getDelta()); // Clamp delta to prevent large jumps

    let portalEntered = false;
    if (controls.isLocked === true) {
        updatePlayer(deltaTime);
        portalEntered = checkPortals(); // Check portal proximity and entry
    }

    // Only run animations if not transitioning through a portal
    if (!portalEntered) {
        // Animate portals (particles, etc.)
        if (startPortalInfo && startPortalInfo.animate) {
            startPortalInfo.animate();
            // Optional: Add group rotation back if desired
            // startPortalInfo.group.rotation.y += 0.005;
        }
        if (exitPortalInfo && exitPortalInfo.animate) {
            exitPortalInfo.animate();
            // Optional: Add group rotation back if desired
            // exitPortalInfo.group.rotation.y -= 0.005;
        }
    }

    renderer.render(scene, camera);
}