// Configuration object
const CONFIG = {
  // Chart dimensions
  chart: {
    width: 900,
    height: 600,
    innerRadiusRatio: 0.3,
    resourceRingRatio: 0.5,
    nodeRingRatio: 0.7,
    vmRingRatio: 0.9
  },
  // Resource colors and thresholds
  resources: {
    CPU: {
      color: "#f4a4a4",  // Rosa pastel
      thresholds: {
        warning: 80,
        critical: 100
      }
    },
    Memoria: {
      color: "#a5c8e1",  // Azul pastel
      thresholds: {
        warning: 80,
        critical: 90
      }
    },
    Disco: {
      color: "#a5d6c8",  // Verde pastel
      thresholds: {
        warning: 80,
        critical: 90
      }
    }
  },
  // Animation durations
  animations: {
    tooltipFadeIn: 200,
    tooltipFadeOut: 500
  },
  // Date format
  dateFormat: {
    locale: 'es-ES',
    options: {
      day: 'numeric', 
      month: 'long', 
      year: 'numeric'
    }
  }
};

// Función principal
async function initialize(jsonData = null) {
  try {
    // Variable para almacenar los datos
    let data;
    
    if (jsonData) {
      // Usar datos proporcionados
      data = jsonData;
    } else {
      // Verificar si hay un parámetro de URL para cargar remotamente
      const urlParams = new URLSearchParams(window.location.search);
      const remoteUrl = urlParams.get('jsonUrl');
      
      if (remoteUrl) {
        // Cargar desde URL remota
        try {
          const response = await fetch(remoteUrl);
          if (!response.ok) {
            throw new Error(`Error cargando datos remotos: ${response.status}`);
          }
          data = await response.json();
        } catch (error) {
          console.error("Error loading remote JSON:", error);
          document.getElementById("chart").innerHTML = 
            `<div style="text-align: center; margin-top: 100px;">
              <p>Error al cargar archivo remoto: ${error.message}</p>
              <p>Por favor, verifique la URL o cargue un archivo local.</p>
            </div>`;
          return;
        }
      } else {
        // Intentar cargar datos desde archivo por defecto con un timestamp para evitar caché
        try {
          const timestamp = new Date().getTime();
          const response = await fetch(`proxmox_stats.json?t=${timestamp}`);
          if (!response.ok) {
            // Si no hay archivo por defecto, mostrar mensaje para cargar
            document.getElementById("chart").innerHTML = 
              `<div style="text-align: center; margin-top: 100px;">
                <p>No se encontró el archivo de datos.</p>
                <p>Por favor, cargue un archivo JSON usando el botón arriba.</p>
              </div>`;
            return;
          }
          data = await response.json();
        } catch (error) {
          console.error("Error loading default file:", error);
          document.getElementById("chart").innerHTML = 
            `<div style="text-align: center; margin-top: 100px;">
              <p>No se encontró el archivo de datos.</p>
              <p>Por favor, cargue un archivo JSON usando el botón arriba.</p>
            </div>`;
          return;
        }
      }
    }
    // Limpiar el área del gráfico antes de crear uno nuevo
    document.getElementById("chart").innerHTML = "";
    
    // Formatear fecha
    const date = new Date(data.timestamp);
    const formattedDate = date.toLocaleDateString(CONFIG.dateFormat.locale, CONFIG.dateFormat.options);
    document.getElementById('date-display').textContent = formattedDate;
    
    // Actualizar estadísticas
    updateStats(data);
    
    // Crear visualización
    createSunburstChart(data);
  } catch (error) {
    console.error("Error loading data:", error);
    document.getElementById("chart").innerHTML = 
      `<div style="text-align: center; color: #d33; margin-top: 100px;">
        Error cargando datos: ${error.message}
      </div>`;
  }
}
// Actualizar estadísticas generales
function updateStats(data) {
  // Contar nodos y VMs
  let totalNodes = 0;
  let activeNodes = 0;
  let totalVMs = 0;
  let runningVMs = 0;
  
  // Variables para CPU, memoria y disco
  let totalCPUMax = 0;
  let totalCPUUsed = 0;
  let totalMemMax = 0;
  let totalMemUsed = 0;
  let totalMemFree = 0;
  let totalDiskMax = 0;
  let totalDiskUsed = 0;
  
  // Calcular totales
  for (const serverKey in data.server_data) {
    for (const nodeKey in data.server_data[serverKey]) {
      const node = data.server_data[serverKey][nodeKey];
      totalNodes++;
      
      if (node.vms_running > 0) {
        activeNodes++;
      }
      
      totalVMs += node.vms_running + node.vms_stopped;
      runningVMs += node.vms_running;
      
      totalCPUMax += node.cpu_max;
      totalCPUUsed += node.cpu_used;
      totalMemMax += node.mem_max;
      totalMemUsed += node.mem_used;
      totalMemFree += node.mem_free;
      totalDiskMax += node.disk_max;
      totalDiskUsed += node.disk_used;
    }
  }
  // Calcular porcentajes
  const cpuOvercommit = totalCPUMax > 0 ? ((totalCPUUsed / totalCPUMax) * 100) - 100 : 0;
  const memUsagePercent = totalMemMax > 0 ? (totalMemUsed / totalMemMax) * 100 : 0;
  
  // Actualizar elementos HTML
  document.getElementById('nodes-count').textContent = totalNodes;
  document.getElementById('nodes-active').textContent = `${activeNodes} activos`;
  document.getElementById('vms-count').textContent = totalVMs;
  document.getElementById('vms-running').textContent = `${runningVMs} en ejecución`;
  document.getElementById('cpu-usage').textContent = `${totalCPUUsed} cores`;
  document.getElementById('cpu-overcommit').textContent = `${cpuOvercommit > 0 ? cpuOvercommit.toFixed(0) + "% sobreasignación" : "Sin sobreasignación"}`;
  document.getElementById('memory-usage').textContent = `${memUsagePercent.toFixed(0)}%`;
  document.getElementById('memory-free').textContent = `${totalMemFree.toFixed(0)} GB disponible`;
}

// Crear el diagrama
function createSunburstChart(data) {
  // Usar dimensiones desde la configuración
  const width = CONFIG.chart.width;
  const height = CONFIG.chart.height;
  const radius = Math.min(width, height) / 2;
  
  // Recursos y sus colores desde la configuración
  const resources = [
    { name: "CPU", color: CONFIG.resources.CPU.color },
    { name: "Memoria", color: CONFIG.resources.Memoria.color },
    { name: "Disco", color: CONFIG.resources.Disco.color }
  ];
  
  // Crear el SVG
  const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  // Crear tooltip
  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);
    
  // Función para actualizar el breadcrumb
  function updateBreadcrumb(text) {
    d3.select("#breadcrumb").text(text);
  }
  
  // Función para formatear valores
  function formatValue(value, decimals = 2) {
    return typeof value === 'number' ? value.toFixed(decimals) : value;
  }
  
  // Función para determinar clase CSS según valor
  function getStatusClass(value, thresholds) {
    if (value >= thresholds.critical) return "critical";
    if (value >= thresholds.warning) return "warning";
    return "ok";
  }
  
  // Función para determinar clase CSS para valores libres
  function getFreeStatusClass(value, resourceType) {
    const resourceConfig = CONFIG.resources[resourceType];
    if (resourceType === "CPU") {
      return value < 0 ? "critical" : "ok";
    } else if (resourceType === "Memoria") {
      return value < 10 ? "warning" : "ok";
    } else { // Disco
      return value < 0 ? "critical" : value < 100 ? "warning" : "ok";
    }
  }
  
  // Función para obtener color según utilización
  function getUtilizationColor(baseColor, utilization) {
    // Si no hay utilización, usar gris claro
    if (utilization === 0) return "#f0f0f0";
    
    // Convertir el color hex a RGB
    const r = parseInt(baseColor.substring(1, 3), 16);
    const g = parseInt(baseColor.substring(3, 5), 16);
    const b = parseInt(baseColor.substring(5, 7), 16);
    
    // Ajustar la intensidad según el nivel de utilización
    const factor = Math.min(utilization / 100, 1);
    
    // Interpolar entre color más claro y el color base según utilización
    const lightColor = [
      Math.min(255, r + 30),
      Math.min(255, g + 30), 
      Math.min(255, b + 30)
    ];
    // Color final interpolado
    const finalR = Math.round(lightColor[0] * (1 - factor) + r * factor);
    const finalG = Math.round(lightColor[1] * (1 - factor) + g * factor);
    const finalB = Math.round(lightColor[2] * (1 - factor) + b * factor);

    // Para nodos sobreutilizados (>100%), intensificar un poco el rojo pero mantener suave
    if (utilization > 100) {
      const overFactor = Math.min((utilization - 100) / 100, 1) * 0.7;
      return `rgb(${Math.min(255, finalR + Math.round((255 - finalR) * overFactor * 0.5))}, 
               ${Math.max(finalG - Math.round(30 * overFactor), finalG * 0.8)}, 
               ${Math.max(finalB - Math.round(30 * overFactor), finalB * 0.8)})`;
    }
    
    return `rgb(${finalR}, ${finalG}, ${finalB})`;
  }
  // Crear un círculo central
  svg.append("circle")
    .attr("r", radius * CONFIG.chart.innerRadiusRatio)
    .attr("fill", "#f8f9fa")
    .attr("stroke", "#ccc");
    
  // Añadir texto en el centro
  svg.append("text")
    .attr("class", "central-text")
    .attr("dy", "-0.5em")
    .text("Clúster");

  svg.append("text")
    .attr("class", "central-text")
    .attr("dy", "0.5em")
    .text("Proxmox");
    
  // Calcular totales para normalización
  let totalCPU = 0;
  let totalMem = 0;
  let totalDisk = 0;
  
  for (const serverKey in data.server_data) {
    for (const nodeKey in data.server_data[serverKey]) {
      const node = data.server_data[serverKey][nodeKey];
      totalCPU += node.cpu_used;
      totalMem += node.mem_used;
      totalDisk += node.disk_used;
    }
  }
  
  // Configuración de arcos
  const innerRadius = radius * CONFIG.chart.innerRadiusRatio;
  const resourceRingOuterRadius = radius * CONFIG.chart.resourceRingRatio;
  const nodeRingOuterRadius = radius * CONFIG.chart.nodeRingRatio;
  const vmRingOuterRadius = radius * CONFIG.chart.vmRingRatio;
  
  // Calcular el ángulo para cada recurso (dividiendo 2*PI en partes iguales)
  const anglePerResource = 2 * Math.PI / resources.length;
  // Crear arcos para los recursos (primer nivel)
  resources.forEach((resource, i) => {
    const startAngle = i * anglePerResource;
    const endAngle = (i + 1) * anglePerResource;
    
    // Crear arco para el recurso
    const arc = d3.arc()
      .innerRadius(innerRadius)
      .outerRadius(resourceRingOuterRadius)
      .startAngle(startAngle)
      .endAngle(endAngle);
      
    // Dibujar el arco
    svg.append("path")
      .attr("d", arc)
      .attr("fill", resource.color)
      .attr("stroke", "white")
      .attr("class", "resource-arc")
      .attr("data-resource", resource.name)
      .on("mouseover", function(event) {
        // Resaltar el arco
        d3.select(this)
          .attr("stroke", "#333")
          .attr("stroke-width", 2);
          
        // Mostrar tooltip
        let totalValue = 0;
        let usageUnit = "";
        
        // Determinar qué recursos usar
        if (resource.name === "CPU") {
          totalValue = totalCPU;
          usageUnit = " cores";
        } else if (resource.name === "Memoria") {
          totalValue = totalMem;
          usageUnit = " GB";
        } else { // Disco
          totalValue = totalDisk;
          usageUnit = " GB";
        }
        // Contar nodos activos por tipo de recurso
        let activeNodeCount = 0;
        for (const serverKey in data.server_data) {
          for (const nodeKey in data.server_data[serverKey]) {
            const node = data.server_data[serverKey][nodeKey];
            if ((resource.name === "CPU" && node.cpu_used > 0) ||
                (resource.name === "Memoria" && node.mem_used > 0) ||
                (resource.name === "Disco" && node.disk_used > 0)) {
              activeNodeCount++;
            }
          }
        }
        
        // Contenido del tooltip
        const tooltipContent = `
          <h4>${resource.name}</h4>
          <p>Total asignado: ${formatValue(totalValue)}${usageUnit}</p>
          <p>${activeNodeCount} nodos activos</p>
        `;
        
        tooltip.transition()
          .duration(CONFIG.animations.tooltipFadeIn)
          .style("opacity", 0.9);
          
        tooltip.html(tooltipContent)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
          
        // Actualizar breadcrumb
        updateBreadcrumb(resource.name);
      })
      .on("mouseout", function() {
        // Restaurar estilo del arco
        d3.select(this)
          .attr("stroke", "white")
          .attr("stroke-width", 1);
          
        // Ocultar tooltip
        tooltip.transition()
          .duration(CONFIG.animations.tooltipFadeOut)
          .style("opacity", 0);
          
        // Limpiar breadcrumb
        updateBreadcrumb("");
      });
      
    // Añadir etiqueta para el recurso
    const angle = startAngle + (endAngle - startAngle) / 2;
    const labelRadius = (innerRadius + resourceRingOuterRadius) / 2;
    const x = Math.sin(angle) * labelRadius;
    const y = -Math.cos(angle) * labelRadius;
    
    svg.append("text")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "white")
      .attr("font-weight", "bold")
      .attr("pointer-events", "none")
      .text(resource.name);
      
    // Crear arcos para los nodos (segundo nivel)
    createNodeArcs(i, resource.name, resource.color);
  });
  // Función para crear arcos de nodos (segundo nivel)
  function createNodeArcs(resourceIndex, resourceName, resourceColor) {
    const startAngle = resourceIndex * anglePerResource;
    const endAngle = (resourceIndex + 1) * anglePerResource;
    
    // Recopilar datos de nodos para este recurso
    let nodes = [];
    
    for (const serverKey in data.server_data) {
      for (const nodeKey in data.server_data[serverKey]) {
        const node = data.server_data[serverKey][nodeKey];
        let value, total, utilization, free;
        
        if (resourceName === "CPU") {
          value = node.cpu_used;
          total = node.cpu_max;
          utilization = total > 0 ? (value / total) * 100 : 0;
          free = node.cpu_free;
        } else if (resourceName === "Memoria") {
          value = node.mem_used;
          total = node.mem_max;
          utilization = total > 0 ? (value / total) * 100 : 0;
          free = node.mem_free;
        } else { // Disco
          value = node.disk_used;
          total = node.disk_max;
          utilization = total > 0 ? (value / total) * 100 : 0;
          free = node.disk_free;
        }
        // Solo considerar nodos con valores > 0
        if (value > 0) {
          nodes.push({
            name: nodeKey,
            value: value,
            total: total,
            utilization: utilization,
            free: free,
            serverKey: serverKey,
            vm_details: node.vm_details
          });
        }
      }
    }
    // Calcular el valor total para normalización
    const totalValue = resourceName === "CPU" ? totalCPU : 
                      resourceName === "Memoria" ? totalMem : totalDisk;
    
    // Si no hay nodos, salir
    if (nodes.length === 0 || totalValue === 0) return;
    
    // Crear arcos para cada nodo
    let currentAngle = startAngle;
    
    nodes.forEach(node => {
      // Calcular el ángulo proporcional al valor
      const angleSize = (node.value / totalValue) * (endAngle - startAngle);
      const nodeStartAngle = currentAngle;
      const nodeEndAngle = currentAngle + angleSize;
      
      // Avanzar el ángulo
      currentAngle = nodeEndAngle;
      
      // Crear arco para el nodo
      const arc = d3.arc()
        .innerRadius(resourceRingOuterRadius)
        .outerRadius(nodeRingOuterRadius)
        .startAngle(nodeStartAngle)
        .endAngle(nodeEndAngle);
        
      // Dibujar el arco
      svg.append("path")
        .attr("d", arc)
        .attr("fill", getUtilizationColor(resourceColor, node.utilization))
        .attr("stroke", "white")
        .attr("class", "node-arc")
        .attr("data-resource", resourceName)
        .attr("data-node", node.name)
        .attr("data-critical", node.utilization > 100 || (resourceName === "Disco" && node.free < 0))
        .on("mouseover", function(event) {
          // Resaltar el arco
          d3.select(this)
            .attr("stroke", "#333")
            .attr("stroke-width", 2);
            
          // Mostrar tooltip
          let tooltipTitle = `<h4>${node.name} (${resourceName})</h4>`;
          let tooltipContent = "";
          
          // Obtener los umbrales de configuración
          const resourceThresholds = CONFIG.resources[resourceName].thresholds;
          
          if (resourceName === "CPU") {
            tooltipContent = `
              ${tooltipTitle}
              <p>Cores asignados: ${formatValue(node.value, 0)}</p>
              <p>Cores físicos: ${formatValue(node.total, 0)}</p>
              <p class="${getStatusClass(node.utilization, resourceThresholds)}">
                Utilización: ${formatValue(node.utilization)}%
              </p>
              <p class="${getFreeStatusClass(node.free, "CPU")}">
                Cores libres: ${formatValue(node.free, 0)}
              </p>
              <p>VMs en ejecución: ${node.vm_details.filter(vm => vm.status === "running").length}</p>
            `;
          } else if (resourceName === "Memoria") {
            tooltipContent = `
              ${tooltipTitle}
              <p>Memoria usada: ${formatValue(node.value)} GB</p>
              <p>Memoria total: ${formatValue(node.total)} GB</p>
              <p class="${getStatusClass(node.utilization, resourceThresholds)}">
                Utilización: ${formatValue(node.utilization)}%
              </p>
              <p class="${getFreeStatusClass(node.free, "Memoria")}">
                Memoria libre: ${formatValue(node.free)} GB
              </p>
              <p>VMs en ejecución: ${node.vm_details.filter(vm => vm.status === "running").length}</p>
            `;
          } else if (resourceName === "Disco") {
              tooltipContent = `
              ${tooltipTitle}
              <p>Disco usado: ${formatValue(node.value)} GB</p>
              <p>Disco total: ${formatValue(node.total)} GB</p>
              <p class="${getStatusClass(node.utilization, resourceThresholds)}">
                Utilización: ${formatValue(node.utilization)}%
              </p>
              <p class="${getFreeStatusClass(node.free, "Disco")}">
                Espacio libre: ${formatValue(node.free)} GB
              </p>
              <p>VMs en ejecución: ${node.vm_details.filter(vm => vm.status === "running").length}</p>
            `;
          }
          tooltip.transition()
            .duration(CONFIG.animations.tooltipFadeIn)
            .style("opacity", 0.9);
            
          tooltip.html(tooltipContent)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
            
          // Actualizar breadcrumb
          updateBreadcrumb(`${resourceName} > ${node.name}`);
          
          // Resaltar las VMs de este nodo
          svg.selectAll(".vm-arc")
            .style("opacity", function() {
              return d3.select(this).attr("data-node") === node.name &&
                     d3.select(this).attr("data-resource") === resourceName ? 1 : 0.3;
            });
        })
        .on("mouseout", function() {
          // Restaurar estilo del arco
          d3.select(this)
            .attr("stroke", () => {
              // Mantener borde rojo para nodos críticos
              return node.utilization > 100 || (resourceName === "Disco" && node.free < 0) ? 
                "#ff0000" : "white";
            })
            .attr("stroke-width", () => {
              // Mantener grosor para nodos críticos
              return node.utilization > 100 || (resourceName === "Disco" && node.free < 0) ? 
                2 : 1;
            });
          // Ocultar tooltip
          tooltip.transition()
            .duration(CONFIG.animations.tooltipFadeOut)
            .style("opacity", 0);
            
          // Limpiar breadcrumb
          updateBreadcrumb("");
          
          // Restaurar opacidad de las VMs
          svg.selectAll(".vm-arc")
            .style("opacity", 1);
        });
        
      // Crear el tercer nivel: VMs para este nodo
      createVMArcs(node, resourceName, resourceColor, nodeStartAngle, nodeEndAngle);
    });
  }
  // Función para crear arcos de VMs (tercer nivel)
  function createVMArcs(node, resourceName, resourceColor, nodeStartAngle, nodeEndAngle) {
    // Filtrar solo VMs en ejecución
    const runningVMs = node.vm_details.filter(vm => vm.status === "running");
    
    // Si no hay VMs, salir
    if (runningVMs.length === 0) return;
    
    // Calcular el valor total de recursos asignados a las VMs
    let totalVMResource = 0;
    
    runningVMs.forEach(vm => {
      if (resourceName === "CPU") {
        totalVMResource += vm.cpu_assigned;
      } else if (resourceName === "Memoria") {
        totalVMResource += vm.mem_assigned;
      } else { // Disco
        totalVMResource += vm.disk_assigned;
      }
    });
    // Si el total es 0, salir
    if (totalVMResource === 0) return;
  
    // Crear arcos para cada VM
    let currentAngle = nodeStartAngle;
    
    runningVMs.forEach(vm => {
      let vmValue;
      
      if (resourceName === "CPU") {
        vmValue = vm.cpu_assigned;
      } else if (resourceName === "Memoria") {
        vmValue = vm.mem_assigned;
      } else { // Disco
        vmValue = vm.disk_assigned;
      }
      
      // Si el valor es 0, omitir
      if (vmValue === 0) return;
      
      // Calcular el ángulo proporcional al valor
      const angleSize = (vmValue / totalVMResource) * (nodeEndAngle - nodeStartAngle);
      const vmStartAngle = currentAngle;
      const vmEndAngle = currentAngle + angleSize;
      
      // Avanzar el ángulo
      currentAngle = vmEndAngle;
      
      // Crear arco para la VM
      const arc = d3.arc()
        .innerRadius(nodeRingOuterRadius)
        .outerRadius(vmRingOuterRadius)
        .startAngle(vmStartAngle)
        .endAngle(vmEndAngle);
      // Obtener un color ligeramente más oscuro que el del nodo
      const darkerColor = (function() {
        const hex = resourceColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Oscurecer un 20%
        const factor = 0.8;
        return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
      })();
      
      // Dibujar el arco
      svg.append("path")
        .attr("d", arc)
        .attr("fill", darkerColor)
        .attr("stroke", "white")
        .attr("stroke-width", 0.5)
        .attr("class", "vm-arc")
        .attr("data-resource", resourceName)
        .attr("data-node", node.name)
        .attr("data-vm", vm.vm_name)
        .attr("opacity", 0.7)
        .on("mouseover", function(event) {
          // Resaltar el arco
          d3.select(this)
            .attr("stroke", "#333")
            .attr("stroke-width", 1)
            .attr("opacity", 1);
            
          // Mostrar tooltip
          let tooltipTitle = `<h4>${vm.vm_name}</h4>`;
          let tooltipContent = "";
          
          if (resourceName === "CPU") {
            tooltipContent = `
              ${tooltipTitle}
              <p>Nodo: ${node.name}</p>
              <p>Cores asignados: ${formatValue(vm.cpu_assigned, 0)}</p>
              <p>Estado: ${vm.status === "running" ? "En ejecución" : "Detenido"}</p>
              <p>Memoria: ${formatValue(vm.mem_assigned)} GB</p>
              <p>Almacenamiento: ${formatValue(vm.disk_assigned)} GB</p>
            `;
          } else if (resourceName === "Memoria") {
              tooltipContent = `
              ${tooltipTitle}
              <p>Nodo: ${node.name}</p>
              <p>Memoria asignada: ${formatValue(vm.mem_assigned)} GB</p>
              <p>Estado: ${vm.status === "running" ? "En ejecución" : "Detenido"}</p>
              <p>Cores: ${formatValue(vm.cpu_assigned, 0)}</p>
              <p>Almacenamiento: ${formatValue(vm.disk_assigned)} GB</p>
            `;
          } else if (resourceName === "Disco") {
            tooltipContent = `
              ${tooltipTitle}
              <p>Nodo: ${node.name}</p>
              <p>Almacenamiento asignado: ${formatValue(vm.disk_assigned)} GB</p>
              <p>Estado: ${vm.status === "running" ? "En ejecución" : "Detenido"}</p>
              <p>Cores: ${formatValue(vm.cpu_assigned, 0)}</p>
              <p>Memoria: ${formatValue(vm.mem_assigned)} GB</p>
            `;
          }
          tooltip.transition()
            .duration(CONFIG.animations.tooltipFadeIn)
            .style("opacity", 0.9);
            
          tooltip.html(tooltipContent)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
            
          // Actualizar breadcrumb
          updateBreadcrumb(`${resourceName} > ${node.name} > ${vm.vm_name}`);
        })
        .on("mouseout", function() {
          // Restaurar estilo del arco
          d3.select(this)
            .attr("stroke", "white")
            .attr("stroke-width", 0.5)
            .attr("opacity", 0.7);
            
          // Ocultar tooltip
          tooltip.transition()
            .duration(CONFIG.animations.tooltipFadeOut)
            .style("opacity", 0);
            
          // Limpiar breadcrumb
          updateBreadcrumb("");
        });
    });
  }
  
  // Resaltar nodos críticos
  svg.selectAll(".node-arc[data-critical='true']")
    .attr("stroke", "#e68080")
    .attr("stroke-width", 2);
}

// Código para manejar la carga de archivos
document.addEventListener('DOMContentLoaded', function() {
  const uploadButton = document.getElementById('upload-button');
  const fileInput = document.getElementById('json-upload');
  const fileNameDisplay = document.getElementById('file-name');
  
  // Cuando se haga clic en el botón, activar el input de archivo
  uploadButton.addEventListener('click', function() {
    fileInput.click();
  });
  
  // Cuando se seleccione un archivo
  fileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Mostrar el nombre del archivo
    fileNameDisplay.textContent = file.name;
    
    // Leer el archivo como texto
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        // Parsear el JSON
        const jsonData = JSON.parse(e.target.result);
        // Reiniciar la visualización con los nuevos datos
        initialize(jsonData);
      } catch (error) {
        console.error("Error parsing JSON:", error);
        document.getElementById("chart").innerHTML = 
          `<div style="text-align: center; color: #d33; margin-top: 100px;">
            Error al procesar el archivo JSON: ${error.message}
          </div>`;
      }
    };
    
    reader.onerror = function() {
      document.getElementById("chart").innerHTML = 
        `<div style="text-align: center; color: #d33; margin-top: 100px;">
          Error al leer el archivo.
        </div>`;
    };
    
    reader.readAsText(file);
  });
});

// Script para panel de instrucciones
document.addEventListener('DOMContentLoaded', function() {
  const instructionsToggle = document.getElementById('instructions-toggle');
  const instructionsContent = document.getElementById('instructions-content');
  const chevron = instructionsToggle.querySelector('.chevron');
  
  instructionsToggle.addEventListener('click', function() {
    instructionsContent.classList.toggle('active');
    chevron.classList.toggle('active');
  });
});

// Iniciar la aplicación cuando se cargue el documento
window.addEventListener('DOMContentLoaded', initialize);
