; (() => {
  let scene, camera, renderer
  let raycaster, mouse
  let centralHub
  const interactiveObjects = []
  let hoveredObject = null
  const floatingShapes = []
  let cursorFollower, objectLabel
  const burstParticles = []

  const startTime = Date.now()
  let orbitsPaused = false

  const CONFIG = {
    magnetStrength: 0.12,
    colors: {
      teal: 0x10b981,
      blue: 0x4488ff,
      coral: 0xff6b6b,
      amber: 0xffaa00,
      purple: 0xaa66ff,
      magenta: 0xff44cc,
      white: 0xffffff,
      background: 0x000000,
    },
  }

  function waitForThree() {
    if (typeof window.THREE !== "undefined") {
      init()
    } else {
      setTimeout(waitForThree, 100)
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForThree)
  } else {
    waitForThree()
  }

  function init() {
    const canvas = document.getElementById("hero-canvas")
    if (!canvas) {
      return
    }

    cursorFollower = document.getElementById("cursor-follower")
    objectLabel = document.getElementById("object-label")

    scene = new window.THREE.Scene()
    scene.fog = new window.THREE.FogExp2(CONFIG.colors.background, 0.008)

    camera = new window.THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.set(0, 7, 17)
    camera.lookAt(0, 2, 0)

    renderer = new window.THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
    })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    raycaster = new window.THREE.Raycaster()
    mouse = new window.THREE.Vector2(-100, -100)

    setupLights()
    createCentralHub()
    createFloatingShapes()

    window.addEventListener("resize", onResize)
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("click", onClick)

    canvas.addEventListener("mouseenter", () => {
      if (cursorFollower) cursorFollower.style.opacity = "1"
    })
    canvas.addEventListener("mouseleave", () => {
      if (cursorFollower) cursorFollower.style.opacity = "0"
      if (objectLabel) objectLabel.style.opacity = "0"
      mouse.set(-100, -100)
    })

    animate()
  }

  function setupLights() {
    const ambient = new window.THREE.AmbientLight(0x404060, 0.5)
    scene.add(ambient)

    const mainLight = new window.THREE.DirectionalLight(0xffffff, 0.8)
    mainLight.position.set(10, 20, 10)
    scene.add(mainLight)

    const lights = [
      { color: CONFIG.colors.teal, pos: [-12, 8, 8], intensity: 60 },
      { color: CONFIG.colors.blue, pos: [12, 8, 8], intensity: 60 },
      { color: CONFIG.colors.coral, pos: [0, 12, -8], intensity: 40 },
      { color: CONFIG.colors.amber, pos: [0, 4, 12], intensity: 30 },
    ]

    lights.forEach((l) => {
      const light = new window.THREE.PointLight(l.color, l.intensity, 40)
      light.position.set(l.pos[0], l.pos[1], l.pos[2])
      scene.add(light)
    })
  }

  function createCentralHub() {
    const group = new window.THREE.Group()

    const coreGeometry = new window.THREE.IcosahedronGeometry(1.8, 2)
    const coreMaterial = new window.THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHover: { value: 0 },
        uColor: { value: new window.THREE.Color(CONFIG.colors.teal) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uHover;
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vec3 viewDir = normalize(vViewPosition);
          float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.5);
          float pulse = 1.0; 
          vec3 baseColor = uColor * pulse; 
          vec3 edgeGlow = uColor * fresnel * 1.5;
          vec3 finalColor = baseColor * 0.6 + edgeGlow;
          float alpha = 0.6 + fresnel * 0.4;
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      side: window.THREE.DoubleSide,
      depthWrite: false,
    })

    const core = new window.THREE.Mesh(coreGeometry, coreMaterial)
    group.add(core)

    const innerGlow = new window.THREE.Mesh(
      new window.THREE.SphereGeometry(1.4, 32, 32),
      new window.THREE.MeshBasicMaterial({
        color: CONFIG.colors.teal,
        transparent: true,
        opacity: 0.2,
      }),
    )
    group.add(innerGlow)

    const wireGeometry = new window.THREE.IcosahedronGeometry(1.85, 1)
    const wireMaterial = new window.THREE.MeshBasicMaterial({
      color: CONFIG.colors.teal,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    })
    const wireframe = new window.THREE.Mesh(wireGeometry, wireMaterial)
    group.add(wireframe)

    // add rotating rings around the hub
    for (let i = 0; i < 3; i++) {
      const ringGeo = new window.THREE.TorusGeometry(2.2 + i * 0.35, 0.025, 16, 80)
      const ringMat = new window.THREE.MeshBasicMaterial({
        color: [CONFIG.colors.teal, CONFIG.colors.blue, CONFIG.colors.coral][i],
        transparent: true,
        opacity: 0.7 - i * 0.15,
      })
      const ring = new window.THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = window.Math.PI / 2 + (i - 1) * 0.35
      ring.userData.ringSpeed = 0.3 + i * 0.15
      group.add(ring)
    }

    group.position.set(0, 4, 0)
    group.userData = {
      name: "LocalHub",
      isInteractive: true,
      isCore: true,
      originalScale: new window.THREE.Vector3(1, 1, 1),
    }

    centralHub = group
    scene.add(group)
    interactiveObjects.push(group)
  }

  // create floating shapes that orbit around the central hub
  function createFloatingShapes() {
    const shapes = [
      {
        type: "tetrahedron",
        size: 1.8,
        orbitRadius: 10,
        orbitSpeed: 0.2,
        startAngle: 0,
        color: CONFIG.colors.purple,
        name: "Food & Dining",
        category: "food",
      },
      {
        type: "torus",
        size: 1.0,
        orbitRadius: 10,
        orbitSpeed: 0.2,
        startAngle: window.Math.PI * 0.6,
        color: CONFIG.colors.amber,
        name: "All Businesses",
        category: "all",
      },
      {
        type: "octahedron",
        size: 1.2,
        orbitRadius: 10,
        orbitSpeed: 0.2,
        startAngle: window.Math.PI * 1.2,
        color: CONFIG.colors.blue,
        name: "Retail Stores",
        category: "retail",
      },
      {
        type: "dodecahedron",
        size: 0.9,
        orbitRadius: 10,
        orbitSpeed: 0.2,
        startAngle: window.Math.PI * 0.3,
        color: CONFIG.colors.coral,
        name: "Services",
        category: "services",
      },
    ]

    const heroContainer = document.getElementById('hero-container');

    shapes.forEach((shape, index) => {
      let geometry

      // create geometry based on shape type
      switch (shape.type) {
        case "icosahedron":
          geometry = new window.THREE.IcosahedronGeometry(shape.size, 1)
          break
        case "octahedron":
          geometry = new window.THREE.OctahedronGeometry(shape.size, 0)
          break
        case "dodecahedron":
          geometry = new window.THREE.DodecahedronGeometry(shape.size, 0)
          break
        case "tetrahedron":
          geometry = new window.THREE.TetrahedronGeometry(shape.size, 0)
          break
        case "torus":
          geometry = new window.THREE.TorusGeometry(shape.size * 0.8, 0.2, 16, 50)
          break
      }

      const material = new window.THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uHover: { value: 0 },
          uColor: { value: new window.THREE.Color(shape.color) },
          uPhase: { value: index * 1.5 },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        // fragment shader with fresnel effect and pulsing glow
        fragmentShader: `
          uniform float uTime;
          uniform float uHover;
          uniform vec3 uColor;
          uniform float uPhase;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 viewDir = normalize(vViewPosition);
            float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.5);
            float pulse = sin(uTime * 1.5 + uPhase) * 0.15 + 0.85;
            float hoverBoost = 1.0 + uHover * 0.7;
            vec3 baseColor = uColor * pulse * hoverBoost;
            vec3 edgeGlow = uColor * fresnel * (1.0 + uHover * 2.0);
            vec3 finalColor = baseColor * 0.6 + edgeGlow;
            float alpha = 0.7 + fresnel * 0.3 + uHover * 0.3;
            gl_FragColor = vec4(finalColor, alpha);
          }
        `,
        transparent: true,
        side: window.THREE.DoubleSide,
        depthWrite: false,
      })

      const mesh = new window.THREE.Mesh(geometry, material)

      const wireGeo = new window.THREE.EdgesGeometry(geometry)
      const wireMat = new window.THREE.LineBasicMaterial({
        color: shape.color,
        transparent: true,
        opacity: 0.5,
      })
      const wireframe = new window.THREE.LineSegments(wireGeo, wireMat)
      mesh.add(wireframe)

      const labelDiv = document.createElement('div');
      labelDiv.textContent = shape.name;
      labelDiv.style.position = 'absolute';
      labelDiv.style.color = '#fff';
      labelDiv.style.background = 'rgba(0, 0, 0, 0.6)';
      labelDiv.style.border = `1px solid #${shape.color.toString(16).padStart(6, '0')}`;
      labelDiv.style.padding = '6px 12px';
      labelDiv.style.borderRadius = '20px';
      labelDiv.style.fontSize = '12px';
      labelDiv.style.fontWeight = 'bold';
      labelDiv.style.pointerEvents = 'none';
      labelDiv.style.zIndex = '10';
      labelDiv.style.transform = 'translate(-50%, -50%)';
      labelDiv.style.transition = 'opacity 0.2s, transform 0.2s';
      labelDiv.style.backdropFilter = 'blur(4px)';
      labelDiv.style.whiteSpace = 'nowrap';

      if (heroContainer) {
        heroContainer.appendChild(labelDiv);
      }

      mesh.userData = {
        name: shape.name,
        category: shape.category,
        isInteractive: true,
        orbitRadius: shape.orbitRadius,
        orbitSpeed: shape.orbitSpeed,
        startAngle: shape.startAngle,
        orbitY: 4 + window.Math.sin(index * 0.8) * 2,
        originalScale: new window.THREE.Vector3(1, 1, 1),
        phase: index * 0.8,
        rotSpeedX: (window.Math.random() - 0.5) * 0.02,
        rotSpeedY: (window.Math.random() - 0.5) * 0.02,
        rotSpeedZ: (window.Math.random() - 0.5) * 0.02,
        wireframe: wireframe,
        pausedAngle: null,
        labelElement: labelDiv
      }

      scene.add(mesh)
      interactiveObjects.push(mesh)
      floatingShapes.push(mesh)
    })
  }

  function createBurstParticles(position, color) {
    const count = 30
    const geometry = new window.THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const velocities = []

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x
      positions[i * 3 + 1] = position.y
      positions[i * 3 + 2] = position.z

      velocities.push(
        new window.THREE.Vector3(
          (window.Math.random() - 0.5) * 0.4,
          (window.Math.random() - 0.5) * 0.4,
          (window.Math.random() - 0.5) * 0.4,
        ),
      )
    }

    geometry.setAttribute("position", new window.THREE.BufferAttribute(positions, 3))

    const material = new window.THREE.PointsMaterial({
      size: 0.15,
      color: color,
      transparent: true,
      opacity: 1,
      blending: window.THREE.AdditiveBlending,
    })

    const burst = new window.THREE.Points(geometry, material)
    burst.userData = { velocities: velocities, life: 1.0, decay: 0.02 }

    scene.add(burst)
    burstParticles.push(burst)
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }

  function onMouseMove(event) {
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    if (cursorFollower) {
      cursorFollower.style.left = event.clientX + "px"
      cursorFollower.style.top = event.clientY + "px"

      if (mouse.x < -1 || mouse.x > 1 || mouse.y < -1 || mouse.y > 1) {
        cursorFollower.style.opacity = '0'
      } else {
        cursorFollower.style.opacity = '1'
      }
    }
    if (objectLabel) {
      objectLabel.style.left = (event.clientX + 20) + "px"
      objectLabel.style.top = (event.clientY + 20) + "px"
    }
  }

  function onClick(event) {
    if (event.target.closest('button, a, input, select, .modal, .business-card')) return
    if (mouse.x < -1 || mouse.x > 1 || mouse.y < -1 || mouse.y > 1) return

    if (hoveredObject) {
      const obj = hoveredObject

      if (!obj.userData.isCore) {
        const origScale = obj.userData.originalScale
        obj.scale.set(origScale.x * 1.3, origScale.y * 1.3, origScale.z * 1.3)
      }

      let color = CONFIG.colors.teal
      if (obj.material && obj.material.uniforms && obj.material.uniforms.uColor) {
        color = obj.material.uniforms.uColor.value.getHex()
      }

      createBurstParticles(obj.position, color)

      if (obj.userData.category) {
        const category = obj.userData.category
        setTimeout(() => {
          const exploreSection = document.getElementById("explore")
          if (exploreSection) exploreSection.scrollIntoView({ behavior: "smooth" })
          const filterBtn = document.querySelector('[data-category="' + category + '"]')
          if (filterBtn) filterBtn.click()
        }, 300)
      }
    }
  }

  function animate() {
    requestAnimationFrame(animate)
    var time = (Date.now() - startTime) / 1000
    updateRaycasting()

    // create vector object for 3D -> 2D math
    var vector = new window.THREE.Vector3()

    for (var k = 0; k < floatingShapes.length; k++) {
      var shape = floatingShapes[k]
      var ud = shape.userData

      var angle
      if (orbitsPaused) {
        if (ud.pausedAngle === null) ud.pausedAngle = ud.startAngle + time * ud.orbitSpeed
        angle = ud.pausedAngle
      } else {
        if (ud.pausedAngle !== null) {
          ud.startAngle = ud.pausedAngle - time * ud.orbitSpeed
          ud.pausedAngle = null
        }
        angle = ud.startAngle + time * ud.orbitSpeed
      }

      // calculate orbit position
      var x = window.Math.cos(angle) * ud.orbitRadius
      var z = window.Math.sin(angle) * ud.orbitRadius
      var floatY = window.Math.sin(time * 0.5 + ud.phase) * 0.3

      shape.position.x = x
      shape.position.z = z
      shape.position.y = ud.orbitY + floatY

      if (hoveredObject === shape) {
        shape.position.x += mouse.x * 2 * CONFIG.magnetStrength
        shape.position.y += mouse.y * 2 * CONFIG.magnetStrength
        ud.labelElement.style.transform = 'translate(-50%, -50%) scale(1.2)' // Pop the label on hover
      } else {
        ud.labelElement.style.transform = 'translate(-50%, -50%) scale(1)' // Reset scale
      }

      shape.rotation.x += ud.rotSpeedX
      shape.rotation.y += ud.rotSpeedY
      shape.rotation.z += ud.rotSpeedZ

      var originalScale = ud.originalScale
      shape.scale.x += (originalScale.x - shape.scale.x) * 0.1
      shape.scale.y += (originalScale.y - shape.scale.y) * 0.1
      shape.scale.z += (originalScale.z - shape.scale.z) * 0.1

      if (shape.material && shape.material.uniforms) {
        shape.material.uniforms.uTime.value = time
      }

      //update label pos
      vector.copy(shape.position);
      vector.project(camera);

      // convert projected coordinates to screen coordinates
      var screenX = (vector.x * 0.5 + 0.5) * window.innerWidth;
      var screenY = -(vector.y * 0.5 - 0.5) * window.innerHeight;

      // update css coordinates 
      ud.labelElement.style.left = screenX + 'px';
      ud.labelElement.style.top = (screenY - 40) + 'px';

      // hide the label if  shape goes behind camera
      if (vector.z > 1) {
        ud.labelElement.style.display = 'none';
      } else {
        ud.labelElement.style.display = 'block';
      }
    }

    if (centralHub) {
      centralHub.rotation.y += 0.005
      centralHub.position.y = 4 + window.Math.sin(time * 0.5) * 0.3

      if (centralHub.children[0] && centralHub.children[0].material && centralHub.children[0].material.uniforms) {
        centralHub.children[0].material.uniforms.uTime.value = time
      }

      for (var l = 0; l < centralHub.children.length; l++) {
        var child = centralHub.children[l]
        if (child.userData && child.userData.ringSpeed) {
          child.rotation.z += child.userData.ringSpeed * 0.01
        }
      }

      centralHub.scale.set(1, 1, 1)
    }

    for (var m = burstParticles.length - 1; m >= 0; m--) {
      var burst = burstParticles[m]
      burst.userData.life -= burst.userData.decay
      burst.material.opacity = burst.userData.life

      var positions = burst.geometry.attributes.position.array
      var velocities = burst.userData.velocities

      for (var n = 0; n < velocities.length; n++) {
        positions[n * 3] += velocities[n].x
        positions[n * 3 + 1] += velocities[n].y
        positions[n * 3 + 2] += velocities[n].z
        velocities[n].multiplyScalar(0.95)
      }
      burst.geometry.attributes.position.needsUpdate = true
      if (burst.userData.life <= 0) {
        scene.remove(burst)
        burst.geometry.dispose()
        burst.material.dispose()
        burstParticles.splice(m, 1)
      }
    }

    camera.lookAt(0, 3, 0)

    renderer.render(scene, camera)
  }

  function updateRaycasting() {
    if (mouse.x < -1 || mouse.x > 1 || mouse.y < -1 || mouse.y > 1) {
      if (hoveredObject) {
        hoveredObject = null
        document.body.style.cursor = "default"
        if (cursorFollower) cursorFollower.classList.remove("hovering")
        if (objectLabel) objectLabel.style.opacity = "0"
      }
      return
    }

    raycaster.setFromCamera(mouse, camera)
    var intersects = raycaster.intersectObjects(interactiveObjects, true)

    if (hoveredObject) {
      if (hoveredObject.userData.wireframe) {
        hoveredObject.userData.wireframe.material.opacity = 0.5
      }
      var mat = hoveredObject.material || (hoveredObject.children[0] && hoveredObject.children[0].material)
      if (mat && mat.uniforms && mat.uniforms.uHover) {
        mat.uniforms.uHover.value = window.Math.max(0, mat.uniforms.uHover.value - 0.05)
      }
    }

    var foundHover = false

    if (intersects.length > 0) {
      var target = intersects[0].object
      while (target.parent && !target.userData.isInteractive) {
        target = target.parent
      }

      if (target.userData.isInteractive) {
        hoveredObject = target
        foundHover = true

        if (target.userData.wireframe) {
          target.userData.wireframe.material.opacity = 1.0
        }

        if (!target.userData.isCore) {
          target.scale.set(1.4, 1.4, 1.4)
        }

        var mat = target.material || (target.children[0] && target.children[0].material)
        if (mat && mat.uniforms && mat.uniforms.uHover) {
          mat.uniforms.uHover.value = window.Math.min(1, mat.uniforms.uHover.value + 0.1)
        }

        if (cursorFollower) cursorFollower.classList.add("hovering")
        if (objectLabel && target.userData.name && target.userData.isCore) {
          objectLabel.textContent = target.userData.name
          objectLabel.style.opacity = "1"
        }
        document.body.style.cursor = "pointer"
      }
    }

    if (!foundHover) {
      hoveredObject = null
      if (cursorFollower) cursorFollower.classList.remove("hovering")
      if (objectLabel) objectLabel.style.opacity = "0"
      document.body.style.cursor = "default"
    }

    orbitsPaused = foundHover && hoveredObject && !hoveredObject.userData.isCore
  }
})()