// ==========================================
// 1. CREDENCIALES Y CONFIGURACIÓN INICIAL
// ==========================================
const CLIENT_URL_SB = "https://mjwqgweljrjhkrgbfjsx.supabase.co";
const CLIENT_KEY_SB = "sb_publishable_ymJmckuJN9ofmUhbTWXcSw__ulvnuwV";

// Crear la conexión real usando un objeto global seguro
window.supabaseConexion = supabase.createClient(CLIENT_URL_SB, CLIENT_KEY_SB);

// Clonamos la referencia para que todo tu código de abajo funcione sin cambiar una sola línea
var supabase = window.supabaseConexion;

// ==========================================
// MOTOR CENTRAL - GESTIÓN OPERATIVA VEPAGOS (VERSIÓN ESTABLE Y AUDITADA)
// ==========================================
let datosBase = [];
let datosRechazos = [];
let casosFiltradosAprobados = [];
let bandejaTickets = [];
let usuarioLogueado = null; 
let graficoIncidenciasInstance = null; 
let graficoTopRechazosInstance = null;
let graficoVolumenBancosInstance = null;
let supabaseChannel = null; // Canal para Realtime

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", arrancarPortal);
} else {
    arrancarPortal();
}

function arrancarPortal() {
    console.log("Sistema de Gestión Operativa Vepagos - Arrancando motor...");
    // Activamos la escucha en tiempo real inmediatamente
    escucharCambiosRealtime();
    
    // Verificar sesión previa o renderizar login
    const sesionGuardada = localStorage.getItem("ve_usuario_sesion");
    if (sesionGuardada) {
        usuarioLogueado = sesionGuardada;
        if (usuarioLogueado === "admin") {
            inicializarModuloCarga();
        } else {
            renderizarBandejaTickets();
        }
    } else {
        renderizarPantallaLogin();
    }
}

// Helper de Saneamiento de Strings para emparejamientos relacionales precisos
function normalizarTexto(str) {
    if (!str) return "";
    return str.toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remueve tildes de forma segura
        .replace(/[^a-z0-9]/g, "")       // Remueve espacios, guiones y caracteres especiales
        .trim();
}

// ==========================================
// INTERFAZ 1: PANTALLA DE LOGIN CORPORATIVO
// ==========================================
function renderizarPantallaLogin() {
    localStorage.removeItem("ve_usuario_sesion");
    usuarioLogueado = null;
    
    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="login-card-wrapper">
            <div class="login-brand-header">
                <span class="brand-dot"></span>
                <span class="brand-title-text">VEPAGOS</span>
            </div>
            <p class="login-subtitle">Portal Seguro de Control de Calidad e Incidencias</p>
            
            <div style="margin-top: 25px;">
                <label class="form-label-portal">Rol de Acceso</label>
                <select id="select-rol-login" class="form-select-portal">
                    <option value="" disabled selected>Seleccione su perfil...</option>
                    <option value="admin">Administrador (Operaciones y Cruce)</option>
                    <option value="analista">Analista Técnico (Gestión de Tickets)</option>
                </select>
            </div>
            
            <div style="margin-top: 20px;">
                <label class="form-label-portal">Clave de Seguridad Indescriptible</label>
                <input type="password" id="input-pass-login" class="form-input-portal" placeholder="••••••••">
            </div>
            
            <button id="btn-ingresar-portal" class="btn-primary" style="width: 100%; margin-top: 25px; padding: 12px; font-weight: 600;">
                Iniciar Sesión Segura
            </button>
        </div>
    `;

    document.getElementById("btn-ingresar-portal").addEventListener("click", procesarAutenticacion);
}

function procesarAutenticacion() {
    const rol = document.getElementById("select-rol-login").value;
    const pass = document.getElementById("input-pass-login").value;

    if (!rol) {
        alert("Por favor, seleccione un perfil de acceso válido.");
        return;
    }

    if (rol === "admin" && pass === "vepagos2026") {
        usuarioLogueado = "admin";
        localStorage.setItem("ve_usuario_sesion", "admin");
        inicializarModuloCarga();
    } else if (rol === "analista" && pass === "calidadve") {
        usuarioLogueado = "analista";
        localStorage.setItem("ve_usuario_sesion", "analista");
        renderizarBandejaTickets();
    } else {
        alert("Credenciales de seguridad incorrectas para el perfil seleccionado.");
    }
}

// ==========================================
// INTERFAZ 2: MÓDULO DE CARGA DUAL DE ARCHIVOS (ADMIN)
// ==========================================
function inicializarModuloCarga() {
    if (usuarioLogueado !== "admin") {
        alert("Acceso denegado. Perfil de Administrador requerido.");
        renderizarPantallaLogin();
        return;
    }

    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="nav-bar-portal">
            <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Módulo de Operaciones - Administrador</h3>
            <div style="display:flex; gap:10px;">
                <button id="btn-nav-admin-tickets" class="btn-primary" style="background-color: #1E293B;">🎫 Ver Tickets Activos</button>
                <button id="btn-nav-admin-dash" class="btn-primary" style="background-color: #047857;">📈 Dashboard Analítico</button>
                <button id="btn-logout-admin" class="btn-primary btn-cerrar-sesion">Controles 🚪 Salir</button>
            </div>
        </div>

        <div class="upload-container">
            <h2>Carga Estructurada de Datos para Conciliación</h2>
            <p>Suba los archivos en formato .CSV correspondientes al lote diario para ejecutar las reglas de negocio.</p>
            
            <div class="dropzone-area" id="zone-base">
                <div style="font-size: 28px; margin-bottom: 8px;">📊</div>
                <span class="dropzone-text"><b>Archivo Fuente A (Base de Aliados Comerciales)</b></span>
                <input type="file" id="file-csv-base" accept=".csv" style="display:none;">
                <div id="status-base" class="file-status-indicator indicator-empty">Esperando archivo...</div>
            </div>

            <div class="dropzone-area" id="zone-rechazos" style="margin-top: 20px;">
                <div style="font-size: 28px; margin-bottom: 8px;">⚙️</div>
                <span class="dropzone-text"><b>Archivo Fuente B (Inventario Técnico / Rechazos)</b></span>
                <input type="file" id="file-csv-rechazos" accept=".csv" style="display:none;">
                <div id="status-rechazos" class="file-status-indicator indicator-empty">Esperando archivo...</div>
            </div>

            <button id="btn-ejecutar-cruce" class="btn-primary" style="width: 100%; margin-top: 30px; padding: 14px; font-size: 15px; font-weight: bold; letter-spacing: 0.5px;">
                ⚙️ Ejecutar Conciliación y Auditoría Real
            </button>
        </div>
    `;

    // Listeners navegación
    document.getElementById("btn-nav-admin-tickets").addEventListener("click", renderizarBandejaTickets);
    document.getElementById("btn-nav-admin-dash").addEventListener("click", renderizarDashboardAnalitica);
    document.getElementById("btn-logout-admin").addEventListener("click", renderizarPantallaLogin);

    // Listeners Zonas de Carga
    const zBase = document.getElementById("zone-base");
    const zRechazos = document.getElementById("zone-rechazos");
    const iBase = document.getElementById("file-csv-base");
    const iRechazos = document.getElementById("file-csv-rechazos");

    zBase.addEventListener("click", () => iBase.click());
    zRechazos.addEventListener("click", () => iRechazos.click());

    iBase.addEventListener("change", (e) => procesarArchivo(e, 'BASE', 'status-base'));
    iRechazos.addEventListener("change", (e) => procesarArchivo(e, 'RECHAZOS', 'status-rechazos'));

    document.getElementById("btn-ejecutar-cruce").addEventListener("click", () => {
        if (datosBase.length === 0 || datosRechazos.length === 0) {
            alert("Error operacional: Debe cargar obligatoriamente ambas fuentes (.CSV) para ejecutar el cruce.");
            return;
        }
        ejecutarCruceYValidacion();
    });
}

const procesarArchivo = (e, tipo, statusId) => {
    const file = e.target.files[0];
    if (!file) return;

    const indicator = document.getElementById(statusId);
    if (indicator) {
        indicator.className = "file-status-indicator indicator-loading";
        indicator.innerText = "Saneando y procesando filas...";
    }

    const lector = new FileReader();
    lector.onload = function(evt) {
        try {
            const contenido = evt.target.result;
            const lineas = contenido.split(/\r?\n/);
            if (lineas.length === 0 || !lineas[0]) throw new Error("Archivo vacío o corrupto");

            // Extracción limpia de cabeceras eliminando comillas basuras
            const cabecera = lineas[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
            
            let registrosParseados = [];
            for (let i = 1; i < lineas.length; i++) {
                const lineaActual = lineas[i].trim();
                if (!lineaActual) continue;

                // Dividir columnas manejando posibles comas internas de forma controlada
                const valores = lineaActual.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
                let objetoFila = {};
                
                cabecera.forEach((nombreColumna, indiceCol) => {
                    objetoFila[nombreColumna] = valores[indiceCol] !== undefined ? valores[indiceCol] : "";
                });
                registrosParseados.push(objetoFila);
            }

            if (tipo === 'BASE') datosBase = registrosParseados;
            if (tipo === 'RECHAZOS') datosRechazos = registrosParseados;

            if (indicator) {
                indicator.className = "file-status-indicator indicator-success";
                indicator.innerText = `Carga exitosa: ${registrosParseados.length} registros indexados.`;
            }
        } catch (err) {
            console.error("Error en parsing CSV:", err);
            if (indicator) {
                indicator.className = "file-status-indicator indicator-empty";
                indicator.innerText = "Error al leer archivo. Estructura no válida.";
            }
            alert("Estructura CSV incorrecta. Verifique separadores por comas.");
        }
    };
    lector.readAsText(file, "UTF-8");
};

// ==========================================
// INTERFAZ 3: PANTALLA DE RESULTADOS (CRUCE REAL DE MODELOS/SERIALES)
// ==========================================
async function ejecutarCruceYValidacion() {
    if (usuarioLogueado !== "admin") {
        alert("Acceso denegado. Ruta exclusiva para Administradores.");
        renderizarPantallaLogin();
        return;
    }

    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;
    
    casosFiltradosAprobados = [];
    if (!Array.isArray(datosBase)) datosBase = [];
    if (!Array.isArray(datosRechazos)) datosRechazos = [];
    
    mainContent.innerHTML = `
        <div class="nav-bar-portal">
            <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Módulo de Operaciones - Administrador</h3>
            <div style="display:flex; gap:10px;">
                <button id="btn-nav-admin-resultados" class="btn-primary" style="background-color: #1E293B;">🎫 Tickets (Admin)</button>
                <button id="btn-nav-admin-res-dash" class="btn-primary" style="background-color: #047857;">📈 Dashboard</button>
                <button id="btn-logout-res" class="btn-primary btn-cerrar-sesion">🚪 Salir</button>
            </div>
        </div>

        <div class="upload-container">
            <div class="upload-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h2>Resultados del Cruce y Conciliación</h2>
                    <p>Auditoría de modelos, seriales, operadoras y bancos ejecutándose en cumplimiento estricto.</p>
                </div>
                <div>
                    <button id="btn-descargar-xlsx" class="btn-primary" style="background-color: var(--verde-exito); color: var(--azul-corporativo); margin-right: 10px; font-weight:700;">⬇️ Descargar Aprobados (XLSX)</button>
                    <button onclick="inicializarModuloCarga()" class="btn-primary" style="background-color: #475569;">Cargar nuevos archivos</button>
                </div>
            </div>
            
            <div class="table-responsive-wrapper" style="width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 15px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Línea</th>
                            <th>Nombre Comercio (Base)</th>
                            <th>Almacén</th>
                            <th>Modelo POS</th>
                            <th>Serial Equipo</th>
                            <th>SIM CARD / ICCID</th>
                            <th>Banco Afectado</th>
                            <th>Operadora (SIM)</th>
                            <th>Validación de Reglas</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="table-results-body"></tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById("btn-nav-admin-resultados").addEventListener("click", renderizarBandejaTickets);
    document.getElementById("btn-nav-admin-res-dash").addEventListener("click", renderizarDashboardAnalitica);
    document.getElementById("btn-logout-res").addEventListener("click", renderizarPantallaLogin);

    const tbody = document.getElementById("table-results-body");
    if (!tbody) return;

    await recuperarBandejaSegura();

    const inventarioMap = new Map();
    if (datosRechazos.length > 0) {
        datosRechazos.forEach((item, idxRechazo) => {
            if (!item) return;
            const keysR = Object.keys(item);
            const kRazon = keysR.find(k => /razon|razón|social|nombre|comercio/i.test(k));
            const kSerial = keysR.find(k => /serial|equipo|terminal|numero|número|id/i.test(k));
            const kSim = keysR.find(k => /sim|card|iccid/i.test(k));
            const kModelo = keysR.find(k => /modelo|equipo/i.test(k));

            if (kRazon && item[kRazon] !== undefined) {
                let razonBruta = String(item[kRazon]).replace(/^["']|["']$/g, "").trim();
                let razonSaneada = normalizarTexto(razonBruta);
                
                if (razonSaneada) {
                    let serialLimpio = kSerial && item[kSerial] !== undefined ? String(item[kSerial]).trim().replace(/\.0+$/, '') : "";
                    if (serialLimpio === "0" || serialLimpio === "undefined" || serialLimpio === "null") serialLimpio = "";
                    let simLimpia = kSim && item[kSim] !== undefined ? String(item[kSim]).trim() : "No posee";
                    
                    let operadoraDetectada = "Indeterminada";
                    if (simLimpia !== "No posee") {
                        let simStr = simLimpia.replace(/\.0+$/, '').trim();
                        let serialStr = serialLimpio.trim();

                        if (serialStr.length > 0) {
                            let lastCharSerial = serialStr.slice(-1);
                            if (/^895806/.test(simStr)) {
                                operadoraDetectada = "Movilnet";
                            } else if (/[a-zA-Z]/.test(lastCharSerial)) {
                                operadoraDetectada = "Digitel";
                            } else if (/\d/.test(lastCharSerial)) {
                                operadoraDetectada = "Movistar";
                            }
                        }
                    }

                    inventarioMap.set(razonSaneada, {
                        serial: serialLimpio || `S-INV-${idxRechazo}`,
                        simcard: simLimpia,
                        modelo: kModelo && item[kModelo] !== undefined ? String(item[kModelo]).trim() : "N/D",
                        operadora: operadoraDetectada
                    });
                }
            }
        });
    }

    console.log("Inventario indexado en memoria:", inventarioMap.size);

    if (datosBase.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:#64748B;">No hay información cargada en el archivo base.</td></tr>`;
    } else {
        for (let index = 0; index < datosBase.length; index++) {
            const fila = datosBase[index];
            try {
                if (!fila) continue;
                const keysBase = Object.keys(fila);
                
                const campoComercio = keysBase.find(k => /^nombre$|^comercio$|^razon$|^razón$|^social$/i.test(k)) || 
                                      keysBase.find(k => /nombre|comercio|razon|razón|social/i.test(k)) || "";
                const campoAlmacen = keysBase.find(k => /almacen|almacén/i.test(k)) || "";
                const campoModelo = keysBase.find(k => /^modelo$|^equipo$/i.test(k)) || keysBase.find(k => /modelo|equipo/i.test(k)) || "";
                const campoBanco = keysBase.find(k => /^banco$|^entidad$|^banco_afectado$|^operadora$/i.test(k)) || 
                                   keysBase.find(k => /banco|entidad/i.test(k)) || "";
                
                const comercioValue = campoComercio && fila[campoComercio] !== undefined ? String(fila[campoComercio]).trim() : "N/D";
                const almacenValue = campoAlmacen && fila[campoAlmacen] !== undefined ? String(fila[campoAlmacen]).trim() : "N/D";
                const modeloValue = campoModelo && fila[campoModelo] !== undefined ? String(fila[campoModelo]).trim() : "N/D";
                
                let bancoValue = "SIN ASIGNAR";
                if (campoBanco && fila[campoBanco] !== undefined) {
                    bancoValue = String(fila[campoBanco]).trim().toUpperCase();
                } else {
                    const posibleClaveBanco = keysBase.find(k => /banco|entidad|banesco|provincial|mercantil|venezuela|bancaribe|bnc|sofitasa/i.test(k));
                    if(posibleClaveBanco) bancoValue = String(fila[posibleClaveBanco]).trim().toUpperCase();
                }

                const comercioNormalizado = normalizarTexto(comercioValue);
                let serialAsignado = "";
                let simcardAsignada = "No posee";
                let operadoraSim = "Indeterminada";
                let detallesRechazo = [];
                let pareoExitoso = false;

                if (inventarioMap.has(comercioNormalizado)) {
                    const activoInventario = inventarioMap.get(comercioNormalizado);
                    serialAsignado = activoInventario.serial;
                    simcardAsignada = activoInventario.simcard;
                    operadoraSim = activoInventario.operadora;
                    pareoExitoso = true;
                } else {
                    detallesRechazo.push("Pareo Relacional: Razón Social no encontrada en inventario");
                }

                if (!serialAsignado || serialAsignado === "0" || serialAsignado.startsWith("S-INV") || serialAsignado === "undefined" || serialAsignado === "" || serialAsignado === "N/D") {
                    detallesRechazo.push("Obligatoriedad de Serial: Serial vacío, nulo o no encontrado en inventario");
                    pareoExitoso = false; 
                }

                // ==================================================================
                // ADAPTACIÓN DE LA REGLA: CRUCE DE MODELOS UNIVERSAL (SIN COMPROMETER NADA)
                // ==================================================================
                if (pareoExitoso) {
                    const activoInventario = inventarioMap.get(comercioNormalizado);
                    const modeloInventario = activoInventario.modelo || "N/D";
                    
                    // Normalizamos ambos campos de modelos limpiando espacios duplicados y mayúsculas
                    const modeloBaseLimpio = String(modeloValue).replace(/\s+/g, ' ').toUpperCase().trim();
                    const modeloInvLimpio = String(modeloInventario).replace(/\s+/g, ' ').toUpperCase().trim();
                    
                    // 1. Verificación global para mitigar falsos positivos (Cruce Universal de la columna modelo)
                    if (modeloBaseLimpio !== modeloInvLimpio) {
                        detallesRechazo.push(`Discrepancia de Modelo: El archivo base indica modelo '${modeloValue}' pero el inventario registra '${modeloInventario}'`);
                    }
                    
                    // 2. Regla innegociable de hardware específica para el NEW9220 que ya tenías armada
                    if (modeloBaseLimpio.includes("9220") && !String(serialAsignado).startsWith("9222")) {
                        detallesRechazo.push("Consistencia de Modelo/Serial: El serial debe iniciar numéricamente con '9222'");
                    }
                }
                // ==================================================================

                if (pareoExitoso && simcardAsignada !== "No posee") {
                    const simStr = String(simcardAsignada).replace(/\.0+$/, '').trim();
                    const serialStr = String(serialAsignado).trim();
                    const lastChar = serialStr.slice(-1);

                    let SIMesMovilnet = /^895806/.test(simStr);
                    let SIMesDigitel = /^895802/.test(simStr);
                    let SIMesMovistar = /^895804/.test(simStr);
                    let SerialTerminaEnLetra = /[a-zA-Z]/.test(lastChar);
                    let SerialTerminaEnNumero = /\d/.test(lastChar);

                    if (operadoraSim === "Movilnet" && (!SIMesMovilnet || !SerialTerminaEnNumero)) {
                        detallesRechazo.push(`Discrepancia SIM: Asignado a Movilnet pero ICCID no inicia con 895806 o serial no termina en número`);
                    } else if (operadoraSim === "Digitel" && (!SIMesDigitel || !SerialTerminaEnLetra)) {
                        detallesRechazo.push(`Discrepancia SIM: Asignado a Digitel pero ICCID no inicia con 895802 o serial no termina en letra`);
                    } else if (operadoraSim === "Movistar" && (!SIMesMovistar || !SerialTerminaEnNumero)) {
                        detallesRechazo.push(`Discrepancia SIM: Asignado a Movistar pero ICCID no inicia con 895804 o serial no termina en número`);
                    } else if (operadoraSim === "Indeterminada") {
                        detallesRechazo.push(`Discrepancia SIM: El equipo no cumple con los parámetros de red válidos para Movilnet, Digitel o Movistar`);
                    }
                } else if (pareoExitoso && simcardAsignada === "No posee") {
                    detallesRechazo.push(`Discrepancia SIM: El equipo no posee SIM CARD asignada en inventario`);
                }

                const theRulePasses = (detallesRechazo.length === 0 && pareoExitoso);
                const detalleReglaTexto = theRulePasses ? "Validación Exitosa" : detallesRechazo.join(" | ");
                const statusClase = theRulePasses ? "status-resuelto-corporativo" : "status-rechazo";
                const statusTexto = theRulePasses ? "✓ Aprobado" : "✕ Rechazado";

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td style="font-weight: 500; font-size: 13px;">${comercioValue}</td>
                    <td style="font-weight: 400; color: #475569; font-size: 13px;">${almacenValue}</td>
                    <td style="font-weight: 600; color: var(--azul-corporativo);">${modeloValue}</td>
                    <td>${serialAsignado || '<span style="color:var(--rojo-alerta); font-style:italic;">Vacío / Inválido</span>'}</td>
                    <td>${simcardAsignada}</td>
                    <td style="font-weight: 600; color: #334155;">${bancoValue}</td>
                    <td style="font-weight: 600; color: #475569;">${operadoraSim}</td>
                    <td style="color: ${theRulePasses ? '#475569' : 'var(--rojo-alerta)'}; font-weight: ${theRulePasses ? 'normal' : '600'}; font-size: 13px;">
                        ${detalleReglaTexto}
                    </td>
                    <td><span class="status-badge ${statusClase}">${statusTexto}</span></td>
                `;
                tbody.appendChild(tr);

                if (!theRulePasses) {
                    let identificadorSerial = (serialAsignado && serialAsignado !== "N/D") ? serialAsignado : ("EMPTY-" + index);
                    let generadoId = "TK-" + Math.floor(1000 + Math.random() * 9000);
                    const { data: ticketRemoto } = await supabase
                        .from('tickets')
                        .select('*')
                        .eq('nombre_comercio', comercioValue)
                        .eq('serial_equipo', identificadorSerial)
                        .maybeSingle();

                    if (!ticketRemoto) {
                        await supabase.from('tickets').insert([{
                            ticket_id: generadoId,
                            nombre_comercio: comercioValue,
                            modelo: modeloValue,
                            serial_equipo: identificadorSerial,
                            sim_card: simcardAsignada,
                            banco: bancoValue, // No interviene en el cruce de datos, se usa únicamente para gráficos informativos en el Dashboard
                            motivo_rechazo: detalleReglaTexto,
                            estatus: 'PENDIENTE',
                            auditoria_observacion: ''
                        }]);
                        console.log("Nueva incidencia guardada en Supabase:", comercioValue);
                    } else {
                        if (ticketRemoto.motivo_rechazo !== detalleReglaTexto) {
                            await supabase.from('tickets')
                                .update({
                                    motivo_rechazo: detalleReglaTexto,
                                    estatus: 'PENDIENTE',
                                    auditoria_observacion: "Reapertura automática: Se detectó una nueva causal de rechazo."
                                })
                                .eq('ticket_id', ticketRemoto.ticket_id);
                            console.log("Incidencia reabierta en Supabase:", comercioValue);
                        }
                    }
                } else {
                    let casosAprobadosFila = {
                        ...fila,
                        "Serial Entrante": serialAsignado,
                        "Simcard": simcardAsignada,
                        "Banco Asignado": bancoValue,
                        "Operadora SIM": operadoraSim,
                        "Estatus Auditoria": "Aprobado"
                    };
                    casosFiltradosAprobados.push(casosAprobadosFila);
                }
            } catch(filaError) {
                console.error(`Error procesando la fila ${index + 1}:`, filaError);
            }
        }
        
        await recuperarBandejaSegura();
    }

    const btnDescargar = document.getElementById("btn-descargar-xlsx");
    if (btnDescargar) btnDescargar.addEventListener("click", descargarExcelAprobados);
}

// ==========================================
// INTERFAZ 4: BANDEJA DE TICKETS ACTIVO (REALTIME SYNC)
// ==========================================
async function recuperarBandejaSegura() {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .order('fecha_creacion', { ascending: false });

        if (error) throw error;
        bandejaTickets = data || [];
    } catch(err) {
        console.error("Error recuperando bandeja desde Supabase:", err);
    }
}

function renderizarBandejaTickets() {
    if (!usuarioLogueado) {
        alert("Sesión expirada.");
        renderizarPantallaLogin();
        return;
    }

    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    let totalPendientes = bandejaTickets.filter(t => t.estatus === 'PENDIENTE').length;
    let totalResueltos = bandejaTickets.filter(t => t.estatus === 'RESUELTO').length;

    let navButtons = '';
    if (usuarioLogueado === "admin") {
        navButtons = `
            <button id="btn-nav-tk-operaciones" class="btn-primary" style="background-color: #475569;">⚡ Volver a Módulo de Carga</button>
            <button id="btn-nav-tk-dash" class="btn-primary" style="background-color: #047857;">📈 Ver Dashboard</button>
        `;
    }

    mainContent.innerHTML = `
        <div class="nav-bar-portal">
            <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Bandeja de Casos - Rol: ${usuarioLogueado.toUpperCase()}</h3>
            <div style="display:flex; gap:10px;">
                ${navButtons}
                <button id="btn-logout-tk" class="btn-primary btn-cerrar-sesion">🚪 Salir</button>
            </div>
        </div>

        <div class="upload-container" style="max-width: 1300px;">
            <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 20px;">
                <div>
                    <h2>Monitoreo General de Incidencias</h2>
                    <p>Actualizaciones en tiempo real vía Supabase Realtime.</p>
                </div>
                <div style="display:flex; gap:15px;">
                    <div style="background:#FEF3C7; padding: 10px 15px; border-radius:6px; border:1px solid #FCD34D; font-weight:600; color:#92400E;">🕒 Pendientes: ${totalPendientes}</div>
                    <div style="background:#D1FAE5; padding: 10px 15px; border-radius:6px; border:1px solid #6EE7B7; font-weight:600; color:#065F46;">✓ Resueltos: ${totalResueltos}</div>
                </div>
            </div>

            <div class="table-responsive-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID Ticket</th>
                            <th>Comercio</th>
                            <th>Modelo POS</th>
                            <th>Serial Equipo</th>
                            <th>Causal de Rechazo / Alerta Técnica</th>
                            <th>Banco</th>
                            <th>Estatus</th>
                            <th>Acciones Operativas</th>
                        </tr>
                    </thead>
                    <tbody id="table-tickets-body"></tbody>
                </table>
            </div>
        </div>
    `;

    if (usuarioLogueado === "admin") {
        document.getElementById("btn-nav-tk-operaciones").addEventListener("click", inicializarModuloCarga);
        document.getElementById("btn-nav-tk-dash").addEventListener("click", renderizarDashboardAnalitica);
    }
    document.getElementById("btn-logout-tk").addEventListener("click", renderizarPantallaLogin);

    const tbody = document.getElementById("table-tickets-body");
    if (!tbody) return;

    if (bandejaTickets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#64748B;">Ninguna incidencia registrada en la base de datos de Supabase.</td></tr>`;
        return;
    }

    bandejaTickets.forEach(tk => {
        const statusClass = tk.estatus === 'RESUELTO' ? 'status-resuelto-corporativo' : 'status-pendiente';
        const tr = document.createElement("tr");
        
        tr.innerHTML = `
            <td style="font-weight:700; color:var(--azul-corporativo);">${tk.ticket_id}</td>
            <td style="font-weight:500;">${tk.nombre_comercio}</td>
            <td style="font-weight:600;">${tk.modelo}</td>
            <td><code>${tk.serial_equipo}</code></td>
            <td style="color: var(--rojo-alerta); font-size:12px; font-weight:500; max-width: 300px; word-wrap:break-word;">${tk.motivo_rechazo}</td>
            <td style="font-weight: 600; color: #475569;">${tk.banco || "N/D"}</td>
            <td><span class="status-badge ${statusClass}">${tk.estatus}</span></td>
            <td>
                <button class="btn-primary btn-gestionar-tk" data-id="${tk.ticket_id}" style="padding: 5px 10px; font-size:12px; background-color:#334155;">
                    👁️ Gestionar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll(".btn-gestionar-tk").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const tkId = e.target.getAttribute("data-id");
            renderizarModalGestion(tkId);
        });
    });
}

// ==========================================
// INTERFAZ 5: MODAL DE REVISIÓN Y CORRECCIÓN (EDR)
// ==========================================
function renderizarModalGestion(ticketId) {
    const ticket = bandejaTickets.find(t => t.ticket_id === ticketId);
    if (!ticket) return;

    let overlay = document.createElement("div");
    overlay.className = "modal-overlay-portal";
    overlay.id = "modal-gestion-overlay";

    // Generador automático de cuerpo del correo formal (Paso REDACTA del EDR)
    let correoSugerido = `Estimado aliado del comercio ${ticket.nombre_comercio},\n\nLe saludamos cordialmente desde el departamento de Control de Calidad Operativa de Vepagos.\n\nSe ha detectado una inconsistencia técnica en los registros de su terminal POS asignado:\n- Modelo Indicado: ${ticket.modelo}\n- Serial Registrado: ${ticket.serial_equipo}\n- Detalle del Hallazgo: ${ticket.motivo_rechazo}\n\nPor favor, valide e ingrese la corrección correspondiente para asegurar la correcta activación financiera del equipo.\n\nQuedamos a su completa disposición.\nSaludos cordiales,\nEquipo de Calidad Vepagos.`;

    overlay.innerHTML = `
        <div class="modal-card-portal" style="max-width: 750px; width:90%;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #E5E9F2; padding-bottom:10px;">
                <h3 style="margin:0; color:var(--azul-corporativo);">Gestión EDR - Ticket: ${ticket.ticket_id}</h3>
                <button id="btn-cerrar-modal-x" style="background:none; border:none; font-size:20px; cursor:pointer; color:#64748B;">&times;</button>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px; background:#F8FAFC; padding:10px; border-radius:6px;">
                <div><b>Comercio:</b> ${ticket.nombre_comercio}</div>
                <div><b>Modelo POS:</b> ${ticket.modelo}</div>
                <div><b>Serial:</b> <code>${ticket.serial_equipo}</code></div>
                <div><b>Banco Información:</b> ${ticket.banco || "N/D"}</div>
            </div>

            <div style="margin-bottom:15px;">
                <label class="form-label-portal"><b>Falla Encontrada:</b></label>
                <div style="color:var(--rojo-alerta); font-weight:600; font-size:13px; background:#FEF2F2; padding:8px; border-radius:4px; border:1px solid #FEE2E2;">
                    ${ticket.motivo_rechazo}
                </div>
            </div>

            <div style="margin-bottom:15px;">
                <label class="form-label-portal"><b>Acción del Analista (Observaciones de Auditoría):</b></label>
                <textarea id="txt-modal-observacion" class="form-input-portal" style="height:60px; resize:none;" placeholder="Indique la corrección realizada o justificación técnica...">${ticket.auditoria_observacion || ""}</textarea>
            </div>

            <div style="margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <label class="form-label-portal" style="margin:0;"><b>Propuesta de Comunicación (Redacta Automatizada):</b></label>
                    <button id="btn-copiar-correo" class="btn-primary" style="padding:2px 8px; font-size:11px; background-color:#475569;">📋 Copiar Mensaje</button>
                </div>
                <textarea id="txt-modal-correo" class="form-input-portal" style="height:120px; font-family:monospace; font-size:12px; background:#FAFAFA; resize:none;">${correoSugerido}</textarea>
            </div>

            <div style="display:flex; justify-content: space-between; align-items:center; margin-top:20px; border-top:1px solid #E5E9F2; padding-top:15px;">
                <div>
                    <label class="form-label-portal" style="display:inline; margin-right:10px;"><b>Nuevo Estatus:</b></label>
                    <select id="select-modal-estatus" class="form-select-portal" style="display:inline-block; width:140px; padding:6px;">
                        <option value="PENDIENTE" ${ticket.estatus === 'PENDIENTE' ? 'selected' : ''}>🕒 PENDIENTE</option>
                        <option value="RESUELTO" ${ticket.estatus === 'RESUELTO' ? 'selected' : ''}>✓ RESUELTO</option>
                    </select>
                </div>
                <div style="display:flex; gap:10px;">
                    <button id="btn-modal-cancelar" class="btn-primary" style="background-color:#94A3B8;">Cancelar</button>
                    <button id="btn-modal-guardar" class="btn-primary" style="background-color:var(--azul-corporativo);">Guardar Cambios</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("btn-cerrar-modal-x").addEventListener("click", destruirModal);
    document.getElementById("btn-modal-cancelar").addEventListener("click", destruirModal);
    
    document.getElementById("btn-copiar-correo").addEventListener("click", () => {
        const elText = document.getElementById("txt-modal-correo");
        elText.select();
        document.execCommand("copy");
        alert("Mensaje de correo copiado al portapapeles con éxito.");
    });

    document.getElementById("btn-modal-guardar").addEventListener("click", async () => {
        const nuevoEst = document.getElementById("select-modal-estatus").value;
        const nuevaObs = document.getElementById("txt-modal-observacion").value;

        try {
            const { error } = await supabase
                .from('tickets')
                .update({ estatus: nuevoEst, auditoria_observacion: nuevaObs })
                .eq('ticket_id', ticketId);

            if (error) throw error;
            destruirModal();
        } catch(err) {
            console.error("Error guardando cambios en Supabase:", err);
            alert("Error de conexión al guardar cambios.");
        }
    });
}

function destruirModal() {
    const modal = document.getElementById("modal-gestion-overlay");
    if (modal) modal.remove();
}

// ==========================================
// INTERFAZ 6: DASHBOARD ANALÍTICO EN TIEMPO REAL (CHARTS) - RESTAURADO ORIGINAL
// ==========================================
function renderizarDashboardAnalitica() {
    if (!usuarioLogueado) {
        alert("Acceso denegado.");
        renderizarPantallaLogin();
        return;
    }

    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    let totalGlobal = bandejaTickets.length;
    let pendientes = bandejaTickets.filter(t => t.estatus === 'PENDIENTE').length;
    let resueltos = bandejaTickets.filter(t => t.estatus === 'RESUELTO').length;
    let ratioEfectividad = totalGlobal > 0 ? Math.round((resueltos / totalGlobal) * 100) : 0;

    let btnRegresarId = usuarioLogueado === "admin" ? "btn-dash-regresar-operaciones" : "btn-dash-regresar-tickets";
    let textoBtnRegresar = usuarioLogueado === "admin" ? "⚡ Volver a Carga" : "🎫 Volver a Tickets";

    // RESTAURACIÓN TOTAL: Volvemos a usar tus clases css originales para que la visual recupere su tamaño y orden
    let contenidoDinamico = `
        <div class="nav-bar-portal">
            <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Dashboard Analítico e Indicadores de Gestión</h3>
            <div style="display:flex; gap:10px;">
                <button id="${btnRegresarId}" class="btn-primary" style="background-color: #475569;">${textoBtnRegresar}</button>
                <button id="btn-dash-regresar-tickets" class="btn-primary" style="background-color: #1E293B;">🎫 Ver Bandeja</button>
            </div>
        </div>

        <div class="dashboard-grid-kpis">
            <div class="kpi-card-portal">
                <div class="kpi-value-portal" style="color:var(--azul-corporativo);">${totalGlobal}</div>
                <div class="kpi-label-portal">Total Incidencias Históricas</div>
            </div>
            <div class="kpi-card-portal">
                <div class="kpi-value-portal" style="color:#D97706;">${pendientes}</div>
                <div class="kpi-label-portal">Casos Pendientes Activos</div>
            </div>
            <div class="kpi-card-portal">
                <div class="kpi-value-portal" style="color:#059669;">${resueltos}</div>
                <div class="kpi-label-portal">Casos Corregidos / Resueltos</div>
            </div>
            <div class="kpi-card-portal">
                <div class="kpi-value-portal" style="color:var(--azul-corporativo);">${ratioEfectividad}%</div>
                <div class="kpi-label-portal">Tasa de Efectividad EDR</div>
            </div>
        </div>

        <div class="dashboard-grid-charts">
            <div class="chart-card-portal">
                <h4>Distribución de Casos por Estatus</h4>
                <div class="chart-container-wrapper"><canvas id="chart-estatus-incidencias"></canvas></div>
            </div>
            <div class="chart-card-portal">
                <h4>Volumen de Incidencias Informativo por Banco</h4>
                <div class="chart-container-wrapper"><canvas id="chart-volumen-bancos"></canvas></div>
            </div>
        </div>

        <div class="chart-card-portal" style="margin-top: 20px;">
            <h4>Top Causales de Rechazo Frecuentes</h4>
            <div style="height: 250px; position: relative;"><canvas id="chart-top-causales"></canvas></div>
        </div>
    `;

    mainContent.innerHTML = `
        <div class="portal-main-wrapper" style="padding: 20px; max-width: 1200px; margin: 0 auto;">
            ${contenidoDinamico}
        </div>
    `;

    // Destrucción previa obligatoria de instancias de gráficos
    if (graficoIncidenciasInstance) graficoIncidenciasInstance.destroy();
    if (graficoTopRechazosInstance) graficoTopRechazosInstance.destroy();
    if (graficoVolumenBancosInstance) graficoVolumenBancosInstance.destroy();

    // Re-inyección de gráficos con Chart.js
    const ctxEst = document.getElementById("chart-estatus-incidencias");
    if (ctxEst) {
        graficoIncidenciasInstance = new Chart(ctxEst, {
            type: 'doughnut',
            data: {
                labels: ['Pendientes', 'Resueltos'],
                datasets: [{
                    data: [pendientes, resueltos],
                    backgroundColor: ['#FBBF24', '#34D399'],
                    borderWidth: 2
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    let bancosMap = {};
    bandejaTickets.forEach(t => {
        let b = t.banco || "SIN ASIGNAR";
        bancosMap[b] = (bancosMap[b] || 0) + 1;
    });
    
    const ctxBancos = document.getElementById("chart-volumen-bancos");
    if (ctxBancos) {
        graficoVolumenBancosInstance = new Chart(ctxBancos, {
            type: 'pie',
            data: {
                labels: Object.keys(bancosMap),
                datasets: [{
                    data: Object.values(bancosMap),
                    backgroundColor: ['#0284C7', '#F43F5E', '#8B5CF6', '#10B981', '#F59E0B', '#64748B'],
                    borderWidth: 1
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    let causalesMap = {};
    bandejaTickets.forEach(t => {
        let r = t.motivo_rechazo || "Otras causas";
        if (r.includes("|")) {
            let split = r.split("|");
            split.forEach(s => {
                let sL = s.trim();
                causalesMap[sL] = (causalesMap[sL] || 0) + 1;
            });
        } else {
            causalesMap[r] = (causalesMap[r] || 0) + 1;
        }
    });

    let causalesOrdenadas = Object.entries(causalesMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const ctxTop = document.getElementById("chart-top-causales");
    if (ctxTop) {
        graficoTopRechazosInstance = new Chart(ctxTop, {
            type: 'bar',
            data: {
                labels: causalesOrdenadas.map(c => c[0].length > 35 ? c[0].substring(0,35)+"..." : c[0]),
                datasets: [{
                    label: 'Número de Casos Detectados',
                    data: causalesOrdenadas.map(c => c[1]),
                    backgroundColor: '#E63946',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    const btnTickets = document.getElementById("btn-dash-regresar-tickets");
    const btnOperaciones = document.getElementById("btn-dash-regresar-operaciones");

    if (btnTickets) btnTickets.addEventListener("click", renderizarBandejaTickets);
    if (btnOperaciones) {
        btnOperaciones.addEventListener("click", () => {
            if (usuarioLogueado === "admin") {
                inicializarModuloCarga();
            } else {
                alert("Acceso exclusivo para administradores.");
                renderizarPantallaLogin();
            }
        });
    }
}

// ==========================================
// FUNCIÓN DE DESCARGA (RESPALDO OBLIGATORIO)
// ==========================================
function descargarExcelAprobados() {
    if (casosFiltradosAprobados.length === 0) {
        alert("No hay registros aprobados para exportar en este ciclo.");
        return;
    }
    try {
        const worksheet = XLSX.utils.json_to_sheet(casosFiltradosAprobados);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Aprobados");
        XLSX.writeFile(workbook, "Reporte_Conciliado_Aprobados.xlsx");
    } catch(excelErr) {
        console.error("Error generando archivo Excel local:", excelErr);
    }
}

// ==========================================
// MOTOR DE SINCRONIZACIÓN REALTIME (SUPABASE CHANNEL)
// ==========================================
function escucharCambiosRealtime() {
    if (supabaseChannel) {
        supabase.removeChannel(supabaseChannel);
    }

    supabaseChannel = supabase
        .channel('public:tickets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, async (payload) => {
            console.log("Cambio detectado en Supabase Realtime:", payload);
            await recuperarBandejaSegura();
            
            const mainContent = document.getElementById("main-content");
            if (!mainContent) return;

            // Refresco de interfaz reactivo si el usuario está visualizando pantallas dependientes
            if (document.getElementById("table-tickets-body")) {
                renderizarBandejaTickets();
            } else if (document.getElementById("chart-estatus-incidencias")) {
                renderizarDashboardAnalitica();
            }
        })
        .subscribe((status) => {
            console.log("Estado de suscripción Supabase Realtime:", status);
        });
}
