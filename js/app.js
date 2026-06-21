// js/app.js

document.addEventListener("DOMContentLoaded", function() {
    const botonAuditoria = document.getElementById("main-exec-btn");
    if (botonAuditoria) {
        botonAuditoria.addEventListener("click", function(e) {
            e.preventDefault();
            procesarArchivosYCruzar();
        });
        actualizarKpisCarga();
    }
    
    if (document.getElementById("tickets-table")) {
        inicializarModuloOperativo();
    }
});

function procesarArchivosYCruzar() {
    const fileInventario = document.getElementById("csv-inventario").files[0];
    const fileReporte = document.getElementById("csv-reporte").files[0];

    if (!fileInventario || !fileReporte) {
        alert("⚠️ Por favor, seleccione ambos archivos (.CSV) antes de ejecutar la auditoría.");
        return;
    }

    let dataInventario = [];
    let dataReporte = [];

    const readerInv = new FileReader();
    readerInv.onload = function(e) {
        dataInventario = csvToJSONTolerante(e.target.result);
        
        const readerRep = new FileReader();
        readerRep.onload = function(evt) {
            dataReporte = csvToJSONTolerante(evt.target.result);
            ejecutarAlgoritmoCruceOriginal(dataInventario, dataReporte);
        };
        readerRep.readAsText(fileReporte, "UTF-8");
    };
    readerInv.readAsText(fileInventario, "UTF-8");
}

function csvToJSONTolerante(csvText) {
    const lineas = csvText.split(/\r?\n/);
    if (lineas.length === 0) return [];

    const primeraLinea = lineas[0];
    const separador = primeraLinea.includes(';') ? ';' : ',';

    // Normalizar cabeceras eliminando comillas y espacios extras, manteniendo su formato original
    const headers = primeraLinea.split(separador).map(h => h.trim().replace(/["']/g, ""));
    const resultado = [];

    for (let i = 1; i < lineas.length; i++) {
        const lineaLimpia = lineas[i].trim();
        if (!lineaLimpia) continue; 
        
        // Manejo básico de comas internas dentro de campos entrecomillados (comunes en nombres de comercios)
        let columnas = [];
        let dentroDeComillas = false;
        let campoActual = "";
        
        for (let j = 0; j < lineaLimpia.length; j++) {
            let char = lineaLimpia[j];
            if (char === '"') {
                dentroDeComillas = !dentroDeComillas;
            } else if (char === separador && !dentroDeComillas) {
                columnas.push(campoActual.trim());
                campoActual = "";
            } else {
                campoActual += char;
            }
        }
        columnas.push(campoActual.trim());

        const obj = {};
        headers.forEach((header, index) => {
            if (header) {
                obj[header] = columnas[index] || "";
            }
        });
        resultado.push(obj);
    }
    return resultado;
}

// VALIDACIONES TÉCNICAS REQUERIDAS
function verificarReglaSim(simSerial, operadora) {
    if (!simSerial) return { valido: false, msg: "Serial de la SIM CARD no coincide con la operadora (SIM vacía)." };
    const sim = simSerial.trim().toUpperCase();
    const op = operadora.trim().toUpperCase();

    if (op.includes("DIGITEL") && !sim.endsWith("F")) {
        return { valido: false, msg: "Serial de la SIM CARD no coincide con la operadora (Digitel debe terminar en F)." };
    }
    if (op.includes("MOVISTAR")) {
        const ultimo = sim.slice(-1);
        if (isNaN(ultimo) || ultimo === " " || ultimo === "") {
            return { valido: false, msg: "Serial de la SIM CARD no coincide con la operadora (Movistar debe terminar en número)." };
        }
    }
    if (op.includes("MOVILNET") && !sim.startsWith("895806")) {
        return { valido: false, msg: "Serial de la SIM CARD no coincide con la operadora (Movilnet debe comenzar por 895806)." };
    }
    return { valido: true };
}

function verificarReglaModelo(serial, modeloCompleto) {
    if (!serial) return { valido: false, msg: "No posee serial asignado." };
    const s = serial.trim().toUpperCase();
    // Normalizar el modelo quitando caracteres como guiones (Q-2 -> Q2) o palabras adicionales
    const m = modeloCompleto.trim().toUpperCase().replace(/-/g, "");

    const matrizModelos = [
        { name: "A50 BANESCO", len: 10 }, { name: "A50", len: 10 },
        { name: "A920 BANESCO", len: 10 }, { name: "A920 PRO BANESCO", len: 10 }, { name: "A920", len: 10 },
        { name: "6210 CREDICARD", len: 8 }, { name: "6210", len: 8 },
        { name: "7210 CREDICARD", len: 8 }, { name: "7210", len: 8 },
        { name: "9220 CREDICARD", len: 10 }, { name: "9220", len: 10 },
        { name: "NEW9220 CREDICARD", len: 10 },
        { name: "8210", len: 8 }, { name: "8220", len: 8 },
        { name: "Q2", len: 16 }, { name: "Q3", len: 16 },
        { name: "P2 MINI", len: 13 }, { name: "P2", len: 13 },
        { name: "T1 PRO", len: 13 }, { name: "T1", len: 13 },
        { name: "D200T", len: 8 }, { name: "S920", len: 8 }
    ];

    const regla = matrizModelos.find(r => m === r.name || m.includes(r.name));
    if (!regla) return { valido: true }; 

    if (s.length !== regla.len) {
        return { valido: false, msg: `Serial no coincide con modelo registrado (Longitud esperada: ${regla.len}, Actual: ${s.length}).` };
    }
    return { valido: true };
}

// =========================================================================
// ALGORITMO DE CRUCE POR COHERENCIA DE NOMBRE DE COMERCIO
// =========================================================================
function ejecutarAlgoritmoCruceOriginal(inventario, credicard) {
    const loteTickets = [];
    let contadorId = 100;

    credicard.forEach(rowCred => {
        contadorId++;

        // Campos base del archivo de Reporte Parámetros
        const nombreComercioCred = (rowCred["Nombre Comercio"] || "").trim().toUpperCase();
        const bancoCred = (rowCred["Banco"] || "SIN ASIGNAR").trim();
        const plataformaCred = (rowCred["Tipo Comunicación"] || rowCred["Tipo de Comunicación"] || "DESCONOCIDO").trim();
        const modeloReporte = (rowCred["Modelo POS"] || "").trim();
        const operadoraReporte = (rowCred["Operadora"] || "DIGITEL").trim();

        // BUSCAR CONSISTENCIA EN EL INVENTARIO USANDO LA ASOCIACIÓN POR NOMBRE DE COMERCIO / RAZON SOCIAL
        const coincidenciaAlmacen = inventario.find(inv => {
            const razonSocialInv = (inv["RAZON SOCIAL"] || "").trim().toUpperCase();
            return razonSocialInv === nombreComercioCred && nombreComercioCred !== "";
        });

        // RELLENAR SERIAL Y SIM CARD EN BASE AL INVENTARIO SI EL REPORTE LOS TRAE VACÍOS
        const serial = (rowCred["Serial Entrante"] || "").trim() || 
                       (coincidenciaAlmacen ? (coincidenciaAlmacen["SERIAL"] || "").trim() : "");
                       
        const sim = (rowCred["Simcard"] || "").trim() || 
                    (coincidenciaAlmacen ? (coincidenciaAlmacen["SIMCARD"] || "").trim() : "");

        const modeloFinal = modeloReporte || (coincidenciaAlmacen ? coincidenciaAlmacen["MODELO"] : "Genérico");

        let ticket = {
            id: `RE-${contadorId}`,
            banco: bancoCred,
            plataforma: plataformaCred,
            motivo: "",
            estado: "Rechazado",
            serial: serial || "SIN SERIAL",
            modelo: modeloFinal
        };

        // EVALUACIÓN DE CONDICIONES POST-RELLENO

        // 1. Condición de Serial Ausente
        if (!serial || serial === "") {
            ticket.motivo = "Se rechaza si no cumple las siguientes condiciones: No posee serial asignado.";
            loteTickets.push(ticket);
            return; 
        }

        // 2. Condición de Longitud por Modelo
        const checkModelo = verificarReglaModelo(serial, modeloFinal);
        if (!checkModelo.valido) {
            ticket.motivo = `Se rechaza si no cumple las siguientes condiciones: ${checkModelo.msg}`;
            loteTickets.push(ticket);
            return;
        }

        // 3. Condición de SIM Card según Operadora
        const checkSim = verificarReglaSim(sim, operadoraReporte);
        if (!checkSim.valido) {
            ticket.motivo = `Se rechaza si no cumple las siguientes condiciones: ${checkSim.msg}`;
            loteTickets.push(ticket);
            return;
        }

        // COTEJO DE CONSISTENCIA FINAL
        if (!coincidenciaAlmacen) {
            ticket.motivo = `Comercio [${nombreComercioCred}] no verificado por consistencia en seguimiento de inventario.`;
        } else {
            // Si pasó todos los filtros anteriores con éxito:
            ticket.id = `OK-${contadorId}`;
            ticket.estado = "Aprobado";
            ticket.motivo = "Equipo validado correctamente. Listo para asignación comercial.";
        }

        loteTickets.push(ticket);
    });

    if (typeof DataManager !== 'undefined') {
        DataManager.guardarTickets(loteTickets);
    }

    actualizarKpisCargaReal(loteTickets);
    renderizarTablaPrevisualizacion(loteTickets);
    mostrarToast("Auditoría completada exitosamente respetando el mapeo real.");
}

function actualizarKpisCargaReal(tickets) {
    const loadDate = document.getElementById("load-date");
    const loadReg = document.getElementById("load-reg");
    const loadDup = document.getElementById("load-dup");

    if (loadDate) loadDate.textContent = "Data Real Cruzada";
    if (loadReg) loadReg.textContent = tickets.length; 
    if (loadDup) loadDup.textContent = tickets.filter(t => t.estado === "Rechazado").length;
}

function actualizarKpisCarga() {
    if (typeof DataManager === 'undefined') return;
    const tickets = DataManager.obtenerTickets();
    if (tickets.length > 0) {
        actualizarKpisCargaReal(tickets);
        renderizarTablaPrevisualizacion(tickets);
    }
}

function renderizarTablaPrevisualizacion(lote) {
    const tableBody = document.querySelector("#preview-table tbody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    lote.forEach(ticket => {
        const tr = document.createElement("tr");
        if (ticket.estado === "Aprobado") tr.classList.add("row-aprobado");
        if (ticket.estado === "Rechazado") tr.classList.add("row-rechazado");

        tr.innerHTML = `
            <td><b>&nbsp;${ticket.id}</b></td>
            <td>${ticket.banco}</td>
            <td>${ticket.plataforma}</td>
            <td style="font-size: 0.85rem;">S/N: ${ticket.serial} - <span style="color:#2c3e50;">${ticket.motivo}</span></td>
            <td><span class="badge badge-${ticket.estado.toLowerCase()}">${ticket.estado}</span></td>
            <td>Sistema Real</td>
            <td><button class="action-btn" type="button" onclick="location.href='operativa.html'">Ver</button></td>
        `;
        tableBody.appendChild(tr);
    });
}

function inicializarModuloOperativo() {
    const tbody = document.getElementById("tickets-tbody");
    const filterBanco = document.getElementById("filter-banco");
    const filterPlataforma = document.getElementById("filter-plataforma");
    const filterEstado = document.getElementById("filter-estado");

    if (typeof DataManager === 'undefined') return;
    const todosLosTickets = DataManager.obtenerTickets();
    if (todosLosTickets.length === 0) return;

    const bancos = [...new Set(todosLosTickets.map(t => t.banco))].filter(Boolean);
    const plataformas = [...new Set(todosLosTickets.map(t => t.plataforma))].filter(Boolean);

    if (filterBanco && filterBanco.options.length <= 1) {
        bancos.forEach(b => {
            const opt = document.createElement("option"); opt.value = b; opt.textContent = b;
            filterBanco.appendChild(opt);
        });
    }
    if (filterPlataforma && filterPlataforma.options.length <= 1) {
        plataformas.forEach(p => {
            const opt = document.createElement("option"); opt.value = p; opt.textContent = p;
            filterPlataforma.appendChild(opt);
        });
    }

    function renderizarTabla() {
        if (!tbody) return;
        tbody.innerHTML = "";
        
        const selBanco = filterBanco ? filterBanco.value : "TODOS";
        const selPlataforma = filterPlataforma ? filterPlataforma.value : "TODOS";
        const selEstado = filterEstado ? filterEstado.value : "TODOS";

        const ticketsFiltrados = todosLosTickets.filter(t => {
            const cumpleBanco = (selBanco === "TODOS" || t.banco === selBanco);
            const cumplePlataforma = (selPlataforma === "TODOS" || t.plataforma === selPlataforma);
            const cumpleEstado = (selEstado === "TODOS" || t.estado === selEstado);
            return cumpleBanco && cumplePlataforma && cumpleEstado;
        });

        if (ticketsFiltrados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No se encontraron incidencias.</td></tr>`;
            return;
        }

        ticketsFiltrados.forEach(ticket => {
            const tr = document.createElement("tr");
            if (ticket.estado === "Aprobado") tr.classList.add("row-aprobado");
            if (ticket.estado === "Rechazado") tr.classList.add("row-rechazado");

            tr.innerHTML = `
                <td><b>&nbsp;${ticket.id}</b></td>
                <td>${ticket.banco}</td>
                <td>${ticket.plataforma}</td>
                <td style="font-size: 0.85rem;">S/N: ${ticket.serial} - ${ticket.motivo}</td>
                <td><span class="badge badge-${ticket.estado.toLowerCase()}">${ticket.estado}</span></td>
                <td>
                    <button class="btn-action" type="button" data-id="${ticket.id}" ${ticket.estado === 'Aprobado' ? 'disabled' : ''}>
                        ${ticket.estado === 'Aprobado' ? '✓ Solventado' : '⚡ Marcar Corregido'}
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-action").forEach(btn => {
            btn.addEventListener("click", function() {
                const ticketId = this.getAttribute("data-id");
                const exito = DataManager.actualizarEstadoTicket(ticketId, "Aprobado");
                if (exito) {
                    mostrarToast(`Ticket #${ticketId} solventado exitosamente.`);
                    location.reload();
                }
            });
        });
    }

    if (filterBanco) filterBanco.addEventListener("change", renderizarTabla);
    if (filterPlataforma) filterPlataforma.addEventListener("change", renderizarTabla);
    if (filterEstado) filterEstado.addEventListener("change", renderizarTabla);

    renderizarTabla();
}

function mostrarToast(mensaje) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.classList.add("toast");
    toast.innerHTML = `<span>⚙️</span> <span>${mensaje}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}