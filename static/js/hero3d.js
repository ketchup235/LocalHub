// Advanced 3D Hero Scene - Self-contained with r128 compatibility
// Features: Raycasting, Custom Shaders, Magnetic Cursor, Orbiting Shapes

;(() => {
  // Debug flag - check browser console
  console.log("[v0] hero3d.js loaded")

  // Scene variables
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

  // Configuration
  const CONFIG = {
    magnetStrength: 0.12,
    colors: {
      teal: 0x00d4aa,
      blue: 0x4488ff,
      coral: 0xff6b6b,
      amber: 0xffaa00,
      purple: 0xaa66ff,
      background: 0x0a0a0f,
    },
  }

  // Wait for DOM and THREE
  function waitForThree() {
    if (typeof window.THREE !== "undefined") {
      console.log("[v0] THREE.js loaded successfully")
      init()
    } else {
      console.log("[v0] Waiting for THREE.js...")
      setTimeout(waitForThree, 100)
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForThree)
  } else {
    waitForThree()
  }

  function init() {
    console.log("[v0] Initializing 3D scene")

    const canvas = document.getElementById("hero-canvas")
    if (!canvas) {
      console.error("[v0] Canvas not found!")
      return
    }

    cursorFollower = document.getElementById("cursor-follower")
    objectLabel = document.getElementById("object-label")

    // Scene
    scene = new window.THREE.Scene()
    scene.background = new window.THREE.Color(CONFIG.colors.background)
    scene.fog = new window.THREE.FogExp2(CONFIG.colors.background, 0.008)

    // Camera
    camera = new window.THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.set(0, 8, 22)
    camera.lookAt(0, 2, 0)

    // Renderer
    renderer = new window.THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
    })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Raycaster
    raycaster = new window.THREE.Raycaster()
    mouse = new window.THREE.Vector2(-100, -100)

    // Build scene
    setupLights()
    createCentralHub()
    createFloatingShapes()

    console.log("[v0] Created " + floatingShapes.length + " orbiting shapes")

    // Events
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

    console.log("[v0] Starting animation loop")
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

    // Core icosahedron with simple glowing material
    const coreGeometry = new window.THREE.IcosahedronGeometry(1.8, 2)
    const coreMaterial = new window.THREE.MeshPhongMaterial({
      color: CONFIG.colors.teal,
      emissive: CONFIG.colors.teal,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.8,
      shininess: 100,
    })

    const core = new window.THREE.Mesh(coreGeometry, coreMaterial)
    group.add(core)

    // Inner glow sphere
    const innerGlow = new window.THREE.Mesh(
      new window.THREE.SphereGeometry(1.4, 32, 32),
      new window.THREE.MeshBasicMaterial({
        color: CONFIG.colors.teal,
        transparent: true,
        opacity: 0.2,
      }),
    )
    group.add(innerGlow)

    // Wireframe overlay
    const wireGeometry = new window.THREE.IcosahedronGeometry(1.85, 1)
    const wireMaterial = new window.THREE.MeshBasicMaterial({
      color: CONFIG.colors.teal,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    })
    const wireframe = new window.THREE.Mesh(wireGeometry, wireMaterial)
    group.add(wireframe)

    // Rotating inner rings
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
        type: "icosahedron",
        size: 1.4,
        orbitRadius: 10,
        orbitSpeed: 0.2,
        startAngle: window.Math.PI * 0.6,
        color: CONFIG.colors.teal,
        name: "Events",
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
        type: "torusKnot",
        size: 1.0,
        orbitRadius: 10,
        orbitSpeed: 0.2,
        startAngle: window.Math.PI * 1.8,
        color: CONFIG.colors.amber,
        name: "Special Deals",
        category: "deals",
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
      {
        type: "box",
        size: 0.75,
        orbitRadius: 10,
        orbitSpeed: 0.2,
        startAngle: window.Math.PI * 1.5,
        color: CONFIG.colors.teal,
        name: "New Arrivals",
        category: "all",
      },
    ]

    shapes.forEach((shape, index) => {
      let geometry

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
        case "torusKnot":
          geometry = new window.THREE.TorusKnotGeometry(shape.size * 0.6, 0.15, 80, 12)
          break
        case "tetrahedron":
          geometry = new window.THREE.TetrahedronGeometry(shape.size, 0)
          break
        case "box":
          geometry = new window.THREE.BoxGeometry(shape.size, shape.size, shape.size)
          break
      }

      // Simple glowing material
      const material = new window.THREE.MeshPhongMaterial({
        color: shape.color,
        emissive: shape.color,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.85,
        shininess: 100,
      })

      const mesh = new window.THREE.Mesh(geometry, material)

      // Wireframe overlay
      const wireGeo = new window.THREE.EdgesGeometry(geometry)
      const wireMat = new window.THREE.LineBasicMaterial({
        color: shape.color,
        transparent: true,
        opacity: 0.5,
      })
      const wireframe = new window.THREE.LineSegments(wireGeo, wireMat)
      mesh.add(wireframe)

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
        pausedAngle: null, // Store angle when paused
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
    burst.userData = {
      velocities: velocities,
      life: 1.0,
      decay: 0.02,
    }

    scene.add(burst)
    burstParticles.push(burst)
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }

  function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

    if (cursorFollower) {
      cursorFollower.style.left = event.clientX + "px"
      cursorFollower.style.top = event.clientY + "px"
    }
  }

  function onClick(event) {
    if (hoveredObject) {
      const obj = hoveredObject
      const origScale = obj.userData.originalScale

      obj.scale.set(origScale.x * 1.3, origScale.y * 1.3, origScale.z * 1.3)

      let color = CONFIG.colors.teal
      if (obj.material && obj.material.color) {
        color = obj.material.color.getHex()
      }

      createBurstParticles(obj.position, color)

      if (obj.userData.category) {
        const category = obj.userData.category
        setTimeout(() => {
          const exploreSection = document.getElementById("explore")
          if (exploreSection) {
            exploreSection.scrollIntoView({ behavior: "smooth" })
          }
          const filterBtn = document.querySelector('[data-category="' + category + '"]')
          if (filterBtn) filterBtn.click()
        }, 300)
      }
    }
  }

  function animate() {
    requestAnimationFrame(animate)

    var time = (Date.now() - startTime) / 1000

    // Update raycasting first to determine if orbits should pause
    updateRaycasting()

    for (var k = 0; k < floatingShapes.length; k++) {
      var shape = floatingShapes[k]
      var ud = shape.userData

      var angle
      if (orbitsPaused) {
        // When paused, keep the angle frozen
        if (ud.pausedAngle === null) {
          ud.pausedAngle = ud.startAngle + time * ud.orbitSpeed
        }
        angle = ud.pausedAngle
      } else {
        // When not paused, calculate angle from time
        // If we were paused, adjust startAngle to continue from where we left off
        if (ud.pausedAngle !== null) {
          ud.startAngle = ud.pausedAngle - time * ud.orbitSpeed
          ud.pausedAngle = null
        }
        angle = ud.startAngle + time * ud.orbitSpeed
      }

      var x = window.Math.cos(angle) * ud.orbitRadius
      var z = window.Math.sin(angle) * ud.orbitRadius
      var floatY = window.Math.sin(time * 0.5 + ud.phase) * 0.3

      shape.position.x = x
      shape.position.z = z
      shape.position.y = ud.orbitY + floatY

      // If hovered, add magnetic pull
      if (hoveredObject === shape) {
        shape.position.x += mouse.x * 2 * CONFIG.magnetStrength
        shape.position.y += mouse.y * 2 * CONFIG.magnetStrength
      }

      // Self rotation
      shape.rotation.x += ud.rotSpeedX
      shape.rotation.y += ud.rotSpeedY
      shape.rotation.z += ud.rotSpeedZ

      // Scale spring back
      var originalScale = ud.originalScale
      shape.scale.x += (originalScale.x - shape.scale.x) * 0.1
      shape.scale.y += (originalScale.y - shape.scale.y) * 0.1
      shape.scale.z += (originalScale.z - shape.scale.z) * 0.1
    }

    // Animate central hub
    if (centralHub) {
      centralHub.rotation.y += 0.005
      centralHub.position.y = 4 + window.Math.sin(time * 0.5) * 0.3

      // Animate inner rings
      for (var l = 0; l < centralHub.children.length; l++) {
        var child = centralHub.children[l]
        if (child.userData && child.userData.ringSpeed) {
          child.rotation.z += child.userData.ringSpeed * 0.01
        }
      }
    }

    // Update burst particles
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

    // Subtle camera movement
    camera.position.x += (mouse.x * 2 - camera.position.x) * 0.02
    camera.position.y += (8 + mouse.y * 1 - camera.position.y) * 0.02
    camera.lookAt(0, 3, 0)

    renderer.render(scene, camera)
  }

  function updateRaycasting() {
    raycaster.setFromCamera(mouse, camera)
    var intersects = raycaster.intersectObjects(interactiveObjects, true)

    // Reset previous hover
    if (hoveredObject) {
      if (hoveredObject.userData.wireframe) {
        hoveredObject.userData.wireframe.material.opacity = 0.5
      }
      if (hoveredObject.material && hoveredObject.material.emissiveIntensity !== undefined) {
        hoveredObject.material.emissiveIntensity = 0.4
      }
    }

    var foundHover = false

    if (intersects.length > 0) {
      var target = intersects[0].object

      // Find parent if it's part of a group
      while (target.parent && !target.userData.isInteractive) {
        target = target.parent
      }

      if (target.userData.isInteractive) {
        hoveredObject = target
        foundHover = true

        if (target.userData.wireframe) {
          target.userData.wireframe.material.opacity = 1.0
        }
        if (target.material && target.material.emissiveIntensity !== undefined) {
          target.material.emissiveIntensity = 0.8
        }

        if (cursorFollower) {
          cursorFollower.classList.add("hovering")
        }

        if (objectLabel && target.userData.name) {
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
