import * as THREE from 'three';

// Basic Portal Creation Function
// Based on sample code from https://gist.github.com/levelsio/ffdbfe356b421b97a31664ded4bc961d
// Credits: levelsio

export function createPortal(scene, position, colorHex, labelText = 'PORTAL') {
    const portalGroup = new THREE.Group();
    portalGroup.position.copy(position);
    // portalGroup.rotation.x = 0.35; // Optional initial rotation
    // portalGroup.rotation.y = 0;

    const portalColor = new THREE.Color(colorHex);

    // Create portal torus effect
    const portalGeometry = new THREE.TorusGeometry(5, 0.5, 16, 100); // Adjusted size
    const portalMaterial = new THREE.MeshPhongMaterial({
        color: portalColor,
        emissive: portalColor,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.8
    });
    const portalTorus = new THREE.Mesh(portalGeometry, portalMaterial);
    portalGroup.add(portalTorus);

    // Create portal inner surface
    const portalInnerGeometry = new THREE.CircleGeometry(4.5, 32); // Slightly smaller than torus inner radius
    const portalInnerMaterial = new THREE.MeshBasicMaterial({
        color: portalColor,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    const portalInner = new THREE.Mesh(portalInnerGeometry, portalInnerMaterial);
    portalGroup.add(portalInner);

    // Add portal label (optional)
    if (labelText) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 64;
        context.fillStyle = `#${portalColor.getHexString()}`; // Use portal color
        context.font = 'bold 30px Arial'; // Slightly smaller font
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(labelText.toUpperCase(), canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const labelGeometry = new THREE.PlaneGeometry(10, 1.25); // Adjust size based on torus size
        const labelMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false // Prevent Z-fighting issues
        });
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.y = 6; // Position above the torus
        portalGroup.add(label);
    }


    // Create particle system for portal effect (simplified)
    const particleCount = 500;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const baseRadius = 5; // Match torus radius

    for (let i = 0; i < particleCount * 3; i += 3) {
        const angle = Math.random() * Math.PI * 2;
        const radius = baseRadius + (Math.random() - 0.5) * 1; // Spread around the torus
        positions[i] = Math.cos(angle) * radius; // x
        positions[i + 1] = Math.sin(angle) * radius; // y (in portal's local XY plane)
        positions[i + 2] = (Math.random() - 0.5) * 1; // z depth variation

        // Set color based on portalColor with slight variation
        colors[i] = portalColor.r * (0.8 + Math.random() * 0.2);
        colors[i + 1] = portalColor.g * (0.8 + Math.random() * 0.2);
        colors[i + 2] = portalColor.b * (0.8 + Math.random() * 0.2);
    }

    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMaterial = new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false // Often good for transparent particles
    });

    const particleSystem = new THREE.Points(particles, particleMaterial);
    portalGroup.add(particleSystem);


    // Add portal group to scene
    scene.add(portalGroup);

    // Create portal collision box (slightly larger for easier entry)
    // We update this once after adding to the scene to get world dimensions
    let portalBox;
    setTimeout(() => { // Delay calculation slightly to ensure transforms are applied
        portalBox = new THREE.Box3().setFromObject(portalGroup, true); // Use true for precise box
        // Optional: Expand the box slightly if needed
        // portalBox.expandByScalar(0.5);
    }, 100);


    // Animate particles (can be expanded)
    function animatePortalParticles() {
        const time = Date.now() * 0.001;
        const posArray = particles.attributes.position.array;

        for (let i = 0; i < particleCount * 3; i += 3) {
            // Simple vertical oscillation example
             posArray[i + 2] += Math.sin(time + i) * 0.01; // Adjust vertical position
        }
        particles.attributes.position.needsUpdate = true;

        // Rotate the particle system itself for a swirling effect
        particleSystem.rotation.z = time * 0.5;

        requestAnimationFrame(animatePortalParticles); // Keep animation loop running
    }
    // Don't start animation loop here - let the main loop handle animation calls if needed
    // Or start it if you want independent portal animation:
    // animatePortalParticles();


    // Return the group and its collision box
    return { group: portalGroup, box: portalBox, animate: animatePortalParticles }; // Return box which will be calculated shortly
}

