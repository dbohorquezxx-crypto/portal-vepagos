// 1. Credenciales de tu proyecto
const CLIENT_URL_SB = "https://mjwqgweljrjhkrgbfjsx.supabase.co";
const CLIENT_KEY_SB = "sb_publishable_ymJmckuJN9ofmUhbTWXcSw__ulvnuwV";

// 2. Crear la conexión real usando un objeto global seguro
window.supabaseConexion = supabase.createClient(CLIENT_URL_SB, CLIENT_KEY_SB);

// 3. Clonamos la referencia para que todo tu código de abajo funcione sin cambiar una sola línea
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
    // Activamos la escucha en tiempo real global
    activarTiempoReal();
    // Descargamos de la nube y luego mostramos el login
    recuperarBandejaSegura().then(() => {
        renderizarPantallaLogin();
    });
}

// Canal de Tiempo Real de Supabase
function activarTiempoReal() {
    if (supabaseChannel) return;
    
    supabaseChannel = supabase
        .channel('cambios-tickets-global')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, async (payload) => {
            console.log("Cambio detectado en tiempo real en la base de datos:", payload);
            
            // 1. Sincronizamos los datos de la nube
            await recuperarBandejaSeguraSilencioso();
            
            // 2. FORZAMOS EL REFRESCO VISUAL INMEDIATO
            if (document.getElementById("table-tickets-body")) {
                renderizarBandejaTickets();
            } else if (document.getElementById("graficaEstatus")) {
                renderizarDashboardAnalitica();
            }
        })
        .subscribe();
}

// Función conectada a Supabase para recuperar la bandeja de entrada
async function recuperarBandejaSegura() {
    try {
        console.log("Consultando tickets en Supabase...");
        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .order('fecha_creacion', { ascending: false });

        if (error) throw error;

        // Mapeamos los campos reales de la base de datos
        bandejaTickets = data.map(t => ({
            id: t.ticket_id,
            comercio: t.nombre_comercio,
            modelo: t.modelo,
            serial: t.serial_equipo,
            sim: t.sim_card,
            banco: t.banco,
            motivo: t.motivo_rechazo,
            estatusTicket: t.estatus, // Mantiene tu lógica visual unificada (PENDIENTE, CORREGIDO, FINALIZADO)
            observacionAuditor: t.auditoria_observacion
        }));
        
        console.log("Bandeja sincronizada desde la nube con", bandejaTickets.length, "tickets.");
    } catch (e) {
        console.error("Error al sincronizar con Supabase. Usando bandeja vacía de respaldo...", e);
        bandejaTickets = [];
    }
}

// Recuperación silenciosa para actualizaciones en segundo plano por Realtime
async function recuperarBandejaSeguraSilencioso() {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .order('fecha_creacion', { ascending: false });
        if (!error && data) {
            bandejaTickets = data.map(t => ({
                id: t.ticket_id,
                comercio: t.nombre_comercio,
                modelo: t.modelo,
                serial: t.serial_equipo,
                sim: t.sim_card,
                banco: t.banco,
                motivo: t.motivo_rechazo,
                estatusTicket: t.estatus,
                observacionAuditor: t.auditoria_observacion
            }));
        }
    } catch (e) {
        console.error(e);
    }
}

function normalizarTexto(texto) {
    if (!texto) return "";
    return String(texto)
        .toLowerCase()
        .replace(/["'«»“”]/g, "")
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizarSerial(ser) {
    return ser ? String(ser).replace(/[^a-zA-Z0-9]/g, "").toLowerCase() : "";
}

function destruirGraficosDashboard() {
    if (graficoIncidenciasInstance) { graficoIncidenciasInstance.destroy(); graficoIncidenciasInstance = null; }
    if (graficoTopRechazosInstance) { graficoTopRechazosInstance.destroy(); graficoTopRechazosInstance = null; }
    if (graficoVolumenBancosInstance) { graficoVolumenBancosInstance.destroy(); graficoVolumenBancosInstance = null; }
}

// ==========================================
// MÓDULO 0: ACCESO MULTIPERFIL
// ==========================================
function renderizarPantallaLogin() {
    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    usuarioLogueado = null;
    destruirGraficosDashboard(); 

    mainContent.innerHTML = `
        <div class="login-wrapper">
            <div class="login-card">
                <h2>Acceso al Portal Vepagos</h2>
                <p>Seleccione su perfil de acceso al sistema</p>
                
                <div style="display:flex; flex-direction:column; gap:15px;">
                    <button id="btn-login-admin" class="btn-primary btn-admin">
                        👑 Iniciar como Administrador
                    </button>
                    <button id="btn-login-analista" class="btn-primary btn-analista">
                        📊 Iniciar como Analista (Operador)
                    </button>
                </div>
                <div style="margin-top:25px; text-align:center; font-size:12px; color:#94a3b8;">
                    Módulo Multiperfil de Auditoría e Incidencias
                </div>
            </div>
        </div>
    `;

    const btnAdmin = document.getElementById("btn-login-admin");
    const btnAnalista = document.getElementById("btn-login-analista");

    if (btnAdmin) {
        btnAdmin.addEventListener("click", () => {
            usuarioLogueado = "admin";
            inicializarModuloCarga();
        });
    }

    if (btnAnalista) {
        btnAnalista.addEventListener("click", () => {
            usuarioLogueado = "analista";
            renderizarBandejaTickets();
        });
    }
}

// ==========================================
// MÓDULO 1: CARGA DE ARCHIVOS (Admin)
// ==========================================
function inicializarModuloCarga() {
    if (usuarioLogueado !== "admin") {
        alert("Acceso denegado. Ruta exclusiva para Administradores.");
        renderizarPantallaLogin();
        return;
    }

    let mainContent = document.getElementById("main-content");
    if (!mainContent) return;
    
    datosBase = [];
    datosRechazos = [];
    casosFiltradosAprobados = [];
    
    mainContent.innerHTML = `
        <div class="nav-bar-portal">
            <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Módulo de Operaciones - Administrador</h3>
            <div style="display:flex; gap:10px;">
                <button id="btn-nav-admin-tickets" class="btn-primary" style="background-color: #1E293B;">🎫 Tickets (Admin)</button>
                <button id="btn-nav-admin-dash" class="btn-primary" style="background-color: #047857;">📈 Dashboard</button>
                <button id="btn-logout" class="btn-primary btn-cerrar-sesion">🚪 Salir</button>
            </div>
        </div>

        <div class="upload-container">
            <div class="upload-header">
                <h2>Panel de Procesamiento de Datos</h2>
                <p>Cargue los reportes inalterados para ejecutar el cruce relacional validado.</p>
            </div>
            
            <div class="upload-grid">
                <div class="upload-card" id="drop-zone-base">
                    <div class="icon-container">📁</div>
                    <h3>1. Reporte Parámetros (Base)</h3>
                    <p>Arrastre aquí el Excel o haga clic para seleccionar</p>
                    <input type="file" id="file-base" accept=".xlsx, .xls" hidden>
                    <div class="file-status" id="status-base">Ningún archivo seleccionado</div>
                </div>

                <div class="upload-card" id="drop-zone-rechazos">
                    <div class="icon-container">📊</div>
                    <h3>2. Reporte Seguimiento (Validación)</h3>
                    <p>Arrastre aquí el Excel o haga clic para seleccionar</p>
                    <input type="file" id="file-rechazos" accept=".xlsx, .xls" hidden>
                    <div class="file-status" id="status-rechazos">Ningún archivo seleccionado</div>
                </div>
            </div>

            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="btn-procesar" class="btn-primary" style="padding: 14px 32px; font-size: 15px;" disabled>Ejecutar Cruce y Conciliación</button>
            </div>
        </div>
    `;

    configurarEventosCargaAdmin();
}

function configurarEventosCargaAdmin() {
    const procesarArchivo = (e, tipo, statusId) => {
        const file = e.target.files[0];
        if (!file) return;

        const status = document.getElementById(statusId);
        if(status) status.innerText = "Procesando...";

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellFormula: false, cellText: true });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonRows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" });

                if (tipo === 'base') {
                    datosBase = jsonRows;
                    console.log("Archivo Base cargado:", datosBase.length, "filas");
                } else {
                    datosRechazos = jsonRows;
                    console.log("Archivo Rechazos cargado:", datosRechazos.length, "filas");
                }

                if(status) {
                    status.innerText = `Listo: ${file.name}`;
                    status.classList.add("loaded");
                }
                verificarArchivosListos();
            } catch (error) {
                console.error("Error leyendo el archivo Excel:", error);
                if(status) {
                    status.innerText = "Error al leer el archivo";
                    status.style.backgroundColor = "#E63946";
                    status.style.color = "#ffffff";
                }
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const setupCard = (cardId, inputId, statusId, tipo) => {
        const card = document.getElementById(cardId);
        const input = document.getElementById(inputId);

        if (card && input) {
            card.addEventListener("click", () => input.click());
            input.addEventListener("change", (e) => procesarArchivo(e, tipo, statusId));
        }
    };

    setupCard("drop-zone-base", "file-base", "status-base", "base");
    setupCard("drop-zone-rechazos", "file-rechazos", "status-rechazos", "rechazos");

    const btnProcesar = document.getElementById("btn-procesar");
    if (btnProcesar) {
        btnProcesar.addEventListener("click", () => {
            if(datosBase.length > 0 && datosRechazos.length > 0) {
                ejecutarCruceYValidacion();
            } else {
                alert("Debe cargar ambos archivos antes de procesar.");
            }
        });
    }

    document.getElementById("btn-nav-admin-tickets").addEventListener("click", renderizarBandejaTickets);
    document.getElementById("btn-nav-admin-dash").addEventListener("click", renderizarDashboardAnalitica);
    document.getElementById("btn-logout").addEventListener("click", renderizarPantallaLogin);
}

function verificarArchivosListos() {
    const btn = document.getElementById("btn-procesar");
    if (btn && datosBase.length > 0 && datosRechazos.length > 0) {
        btn.removeAttribute("disabled");
    }
}

// ==========================================
// MÓDULO 2: AUDITORÍA Y CRUCE
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

                if (pareoExitoso && (String(modeloValue).includes("9220") || String(modeloValue).includes("9220 CREDICARD"))) {
                    if (!String(serialAsignado).startsWith("9222")) {
                        detallesRechazo.push("Consistencia de Modelo/Serial: El serial debe iniciar numéricamente con '9222'");
                    }
                    
                    const activoInventario = inventarioMap.get(comercioNormalizado);
                    const modeloInventario = activoInventario.modelo || "";
                    const modeloBaseLimpio = String(modeloValue).replace(/\s+/g, ' ').toUpperCase().trim();
                    const modeloInvLimpio = String(modeloInventario).replace(/\s+/g, ' ').toUpperCase().trim();
                    
                    const esCredicardBase = modeloBaseLimpio.includes("CREDICARD");
                    const esCredicardInv = modeloInvLimpio.includes("CREDICARD");
                    
                    if (esCredicardBase !== esCredicardInv) {
                        detallesRechazo.push(`Discrepancia de Modelo: El archivo base indica modelo '${modeloValue}' pero el inventario registra '${modeloInventario}'`);
                    }
                }

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
                            banco: bancoValue,
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
// MÓDULO 3: BANDEJA DE TICKETS (CONECTADO A SUPABASE)
// ==========================================
async function renderizarBandejaTickets() {
    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    // 1. Traer datos frescos y mapear respetando las columnas físicas de Supabase
    await recuperarBandejaSegura();

    // 2. REFRESCO VISUAL FORZADO: Limpiamos y repintamos la tabla inmediatamente
    const tableBody = document.getElementById("table-tickets-body");
    if (tableBody) {
        tableBody.innerHTML = ""; // Vaciamos la tabla actual
        
        // Suponiendo que 'tickets' es tu arreglo global con la información fresca
        tickets.forEach(ticket => {
            const fila = document.createElement("tr");
            fila.innerHTML = `
                <td>${ticket.id}</td>
                <td>${ticket.cliente || ''}</td>
                <td>${ticket.estatus || ''}</td>
                <td>${ticket.analista || ''}</td>
            `;
            tableBody.appendChild(fila);
        });
    }

    let botonVolver = "";
    let botonDash = `<button id="btn-nav-dash-analista" class="btn-primary" style="background-color: var(--verde-exito); border: none; padding: 8px 16px; border-radius: 6px; color: var(--azul-corporativo); cursor: pointer; font-weight: 700; margin-right: 10px;">📈 Dashboard</button>`;
    
    if (usuarioLogueado === "admin") {
        botonVolver = `${botonDash} <button id="btn-volver-admin" class="btn-primary" style="background-color: #475569; border: none; padding: 8px 16px; border-radius: 6px; color: white; cursor: pointer; font-weight: 500;">⬅️ Volver</button>`;
    } else {
        botonVolver = `${botonDash} <button id="btn-logout-analista" class="btn-primary btn-cerrar-sesion" style="border:none; padding:8px 16px; border-radius:6px; color:white; cursor:pointer; font-weight:500;">🚪 Cerrar Sesión</button>`;
    }
}
    mainContent.innerHTML = `
        <div class="nav-bar-portal">
            <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Módulo de Gestión de Tickets (${usuarioLogueado === 'admin' ? 'Visualización Admin' : 'Dashboard Analista'})</h3>
            <div>${botonVolver}</div>
        </div>

        <div class="upload-container">
            <div class="upload-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h2>🎫 Bandeja de Tickets e Incidencias</h2>
                    <p>Gestión de reportes rechazados, alertas de corrección en caliente e historial de auditoría (Nube).</p>
                </div>
            </div>

            <div style="display:flex; gap:20px; margin: 20px 0;">
                <div class="kpi-wrapper-pendientes" style="width: 33%; text-align: center;">
                    <div class="kpi-titulo">Pendientes de Corrección</div>
                    <div class="kpi-valor" id="kpi-pendientes">0</div>
                </div>
                <div class="kpi-wrapper-corregidos" style="width: 33%; text-align: center;">
                    <div class="kpi-titulo">Corregidos / Notificados</div>
                    <div class="kpi-valor" id="kpi-corregidos">0</div>
                </div>
                <div class="kpi-wrapper-finalizados" style="width: 33%; text-align: center;">
                    <div class="kpi-titulo">Casos Cerrados (Finalizados)</div>
                    <div class="kpi-valor" id="kpi-finalizados">0</div>
                </div>
            </div>

            <div class="table-responsive-wrapper" style="width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-top: 15px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Ticket</th>
                            <th>Nombre Comercio</th>
                            <th>Modelo</th>
                            <th>Serial Equipo</th>
                            <th>SIM Card</th>
                            <th>Banco</th>
                            <th>Motivo de Rechazo</th>
                            <th>Estatus</th>
                            <th>Acciones</th>
                            <th>Auditoría / Observaciones</th>
                        </tr>
                    </thead>
                    <tbody id="table-tickets-body"></tbody>
                </table>
            </div>
        </div>
    `;

    if (usuarioLogueado === "admin") {
        document.getElementById("btn-volver-admin").addEventListener("click", inicializarModuloCarga);
        document.getElementById("btn-nav-dash-analista").addEventListener("click", renderizarDashboardAnalitica);
    } else {
        document.getElementById("btn-logout-analista").addEventListener("click", renderizarPantallaLogin);
        document.getElementById("btn-nav-dash-analista").addEventListener("click", renderizarDashboardAnalitica);
    }

    const tbody = document.getElementById("table-tickets-body");
    if (!tbody) return;

    if (bandejaTickets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 30px; font-style:italic; color:#94a3b8;">No existen incidencias asignadas o cargadas en el sistema.</td></tr>`;
        updateKpi(0, 0, 0);
        return;
    }
}

    let contPendientes = 0;
    let contCorregidos = 0;
    let contFinalizados = 0;

    bandejaTickets.forEach((ticket) => {
        // Homologación de mayúsculas/minúsculas para el conteo de los KPIs
        const estatusUpper = String(ticket.estatusTicket).toUpperCase();

        if (estatusUpper === "PENDIENTE") contPendientes++;
        if (estatusUpper === "CORREGIDO") contCorregidos++;
        if (estatusUpper === "FINALIZADO") contFinalizados++;

        let estatusBadge = "";
        let accionesHtml = "";
        let auditoriaHtml = "";

        if (estatusUpper === "PENDIENTE") {
            estatusBadge = `<span class="status-badge" style="background-color:#fef3c7; color:#d97706; border-color:#f59e0b; letter-spacing:0.5px; font-weight:700; text-transform:uppercase; padding:6px 12px; border-radius:20px; font-size:11px; border:1px solid transparent;">⏳ Pendiente</span>`;
            
            if (usuarioLogueado === "analista") {
                accionesHtml = `<button class="btn-primary btn-corregir" data-id="${ticket.id}" style="background-color:var(--azul-corporativo); padding:6px 12px; font-size:12px;">Marcar como Corregido</button>`;
            } else {
                accionesHtml = `<span style="font-size:11px; font-style:italic; color:#64748b;">Acceso restringido a operador</span>`;
            }
            auditoriaHtml = `<span style="color:#64748b; font-size:12px; font-style:italic;">Esperando corrección...</span>`;
        
        } else if (estatusUpper === "CORREGIDO") {
            estatusBadge = `<span class="status-badge" style="background-color:#dbeafe; color:#2563eb; border-color:#bfdbfe; letter-spacing:0.5px; font-weight:700; text-transform:uppercase; padding:6px 12px; border-radius:20px; font-size:11px; border:1px solid transparent;">🔔 Notificado (Corregido)</span>`;
            
            if (usuarioLogueado === "analista") {
                accionesHtml = `<span style="font-size:12px; color:var(--verde-exito); font-weight:500;">✓ Notificación enviada</span>`;
            } else {
                accionesHtml = `<span style="font-size:11px; font-style:italic; color:#64748b;">En bandeja de revisión</span>`;
            }
            
            if (usuarioLogueado === "admin") {
                auditoriaHtml = `
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        <input type="text" id="obs-${ticket.id}" placeholder="Observación (opcional)" style="font-size:12px; padding:4px; border:1px solid #cbd5e1; border-radius:4px;">
                        <div style="display:flex; gap:4px;">
                            <button class="btn-primary btn-finalizar" data-id="${ticket.id}" style="background-color:var(--verde-exito); color:var(--azul-corporativo); padding:4px 8px; font-size:11px; font-weight:700; border:none;">Finalizar</button>
                            <button class="btn-primary btn-reabrir" data-id="${ticket.id}" style="background-color:var(--rojo-alerta); color:#ffffff; padding:4px 8px; font-size:11px; font-weight:700; border:none;">Reabrir</button>
                        </div>
                    </div>
                `;
            } else {
                auditoriaHtml = `<span style="font-size:12px; color:#3b82f6; font-style:italic;">En revisión por auditoría...</span>`;
            }
        
        } else if (estatusUpper === "FINALIZADO") {
            estatusBadge = `<span class="status-badge status-resuelto-corporativo">✓ Finalizado (Aprobado)</span>`;
            accionesHtml = `<span style="font-size:12px; color:#097c47; font-weight:600;">Incidencia Cerrada</span>`;
            auditoriaHtml = `<span style="font-size:12px; font-weight:500; color:#334155;">Caso Aprobado. ${ticket.observacionAuditor ? `Obs: ${ticket.observacionAuditor}` : ''}</span>`;
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight:600; color:var(--azul-corporativo);">${ticket.id}</td>
            <td style="font-size:13px; font-weight:500;">${ticket.comercio}</td>
            <td style="font-weight:600; color:var(--azul-corporativo);">${ticket.modelo}</td>
            <td style="font-size:13px;">${ticket.serial}</td>
            <td style="font-size:13px;">${ticket.sim}</td>
            <td style="font-size:12px; font-weight:600; color:#475569;">${ticket.banco || 'N/D'}</td>
            <td style="font-size:11px; color:#475569;">${ticket.motivo}</td>
            <td>${estatusBadge}</td>
            <td style="text-align:center;">${accionesHtml}</td>
            <td>${auditoriaHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    updateKpi(contPendientes, contCorregidos, contFinalizados);
    configurarEventosTickets();
}

function updateKpi(p, c, f) {
    const pend = document.getElementById("kpi-pendientes");
    const corr = document.getElementById("kpi-corregidos");
    const fin = document.getElementById("kpi-finalizados");
    if(pend) pend.innerText = p;
    if(corr) corr.innerText = c;
    if(fin) fin.innerText = f;
}

// ==========================================
// CONFIGURACIÓN DE EVENTOS (ACTUALIZANDO EN SUPABASE)
// ==========================================
function configurarEventosTickets() {
    // 1. OPERACIÓN DEL ANALISTA: MARCAR COMO CORREGIDO
    document.querySelectorAll(".btn-corregir").forEach(button => {
        button.addEventListener("click", async (e) => {
            const ticketId = e.target.getAttribute("data-id");
            
            // Corregido: Filtramos por la columna física 'ticket_id' y actualizamos el campo físico 'estatus'
            const { error } = await supabase
                .from('tickets')
                .update({ estatus: "CORREGIDO" })
                .eq('ticket_id', ticketId);

            if (!error) {
                alert(`¡Se ha actualizado el estatus a "Corregido" en la nube!`);
                renderizarBandejaTickets();
            } else {
                console.error(error);
                alert("Error al actualizar en Supabase.");
            }
        });
    });

    // 2. OPERACIÓN DEL ADMIN: FINALIZAR CASO
    document.querySelectorAll(".btn-finalizar").forEach(button => {
        button.addEventListener("click", async (e) => {
            const ticketId = e.target.getAttribute("data-id");
            const observacionInput = document.getElementById(`obs-${ticketId}`);
            const observacion = observacionInput ? observacionInput.value : "";

            // Corregido: Filtramos por la columna física 'ticket_id' y mapeamos los campos físicos de auditoría
            const { error } = await supabase
                .from('tickets')
                .update({ 
                    estatus: "FINALIZADO",
                    auditoria_observacion: observacion 
                })
                .eq('ticket_id', ticketId);

            if (!error) {
                alert(`El ticket ${ticketId} ha sido auditado y cerrado en la nube.`);
                renderizarBandejaTickets();
            } else {
                alert("Error al finalizar el ticket.");
            }
        });
    });

    // 3. OPERACIÓN DEL ADMIN: REABRIR CASO
    document.querySelectorAll(".btn-reabrir").forEach(button => {
        button.addEventListener("click", async (e) => {
            const ticketId = e.target.getAttribute("data-id");
            const observacionInput = document.getElementById(`obs-${ticketId}`);
            const observacion = observacionInput ? observacionInput.value : "";

            if (observacion.trim() === "") {
                alert("Para reabrir un caso, debe indicar una observación obligatoria explicando el motivo.");
                return;
            }

            // Corregido: Filtramos por la columna física 'ticket_id' y mapeamos a 'estatus' y 'auditoria_observacion'
            const { error } = await supabase
                .from('tickets')
                .update({ 
                    estatus: "PENDIENTE",
                    auditoria_observacion: observacion 
                })
                .eq('ticket_id', ticketId);

            if (!error) {
                alert(`El ticket ${ticketId} ha sido reabierto.`);
                renderizarBandejaTickets();
            } else {
                alert("Error al reabrir el ticket.");
            }
        });
    });
}

// ==========================================
// MÓDULO 4: DASHBOARD PREMIUM (LECTURA ACTUALIZADA)
// ==========================================
async function renderizarDashboardAnalitica() {
    const { data: ticketsFrescos } = await supabase.from('tickets').select('*');
    
    // Sincronizamos la estructura local
    bandejaTickets = (ticketsFrescos || []).map(t => ({
        id: t.ticket_id,
        comercio: t.nombre_comercio,
        modelo: t.modelo,
        serial: t.serial_equipo,
        sim: t.sim_card,
        banco: t.banco,
        motivo: t.motivo_rechazo,
        estatusTicket: t.estatus,
        observacionAuditor: t.auditoria_observacion
    }));
    
    const totalIncidentes = bandejaTickets.length;
    const totalAprobados = window.casosFiltradosAprobados ? window.casosFiltradosAprobados.length : 0;

    const conteoBancos = {};
    const conteoRechazos = {};

    bandejaTickets.forEach(ticket => {
        let bancoSaneado = ticket.banco ? ticket.banco.trim().toUpperCase() : "NO ESPECIFICADO";
        if (bancoSaneado === "SIN ASIGNAR" || bancoSaneado === "") {
            bancoSaneado = "NO ESPECIFICADO";
        }
        conteoBancos[bancoSaneado] = (conteoBancos[bancoSaneado] || 0) + 1;

        let motivoSaneado = "Otras Discrepancias";
        if (/pareo|razón|social/i.test(ticket.motivo)) {
            motivoSaneado = "Error de Pareo (Razón Social)";
        } else if (/obligatoriedad|serial vacío/i.test(ticket.motivo)) {
            motivoSaneado = "Serial Vacío o Nulo";
        } else if (/consistencia|modelo\/serial/i.test(ticket.motivo)) {
            motivoSaneado = "Inconsistencia Modelo vs Serial";
        } else if (/discrepancia sim|iccid/i.test(ticket.motivo)) {
            motivoSaneado = "Falla de Validación SIM Card";
        }

        conteoRechazos[motivoSaneado] = (conteoRechazos[motivoSaneado] || 0) + 1;
    });

    const bancosLabels = Object.keys(conteoBancos);
    const bancosData = Object.values(conteoBancos);
    const rechazosLabels = Object.keys(conteoRechazos);
    const rechazosData = Object.values(conteoRechazos);

    const htmlDashboard = `
        <div style="display:flex; flex-direction:column; gap:24px; font-family:'Inter', sans-serif;">
            <div class="upload-header" style="margin:0;">
                <h2>📈 Dashboard y Analítica de Control Operativo</h2>
                <p>Monitoreo gerencial en tiempo real conectado a Supabase.</p>
            </div>
            
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:20px;">
                <div class="kpi-card" style="background:#fff; padding:20px; border-radius:8px; border-left:5px solid var(--rojo-alerta); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <h3 style="margin:0; color:#64748B; font-size:13px; text-transform:uppercase; font-weight:600;">Incidencias Totales</h3>
                    <p style="margin:8px 0 0 0; font-size:32px; font-weight:700; color:var(--rojo-alerta);">${totalIncidentes}</p>
                </div>
                <div class="kpi-card" style="background:#fff; padding:20px; border-radius:8px; border-left:5px solid #10D07A; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <h3 style="margin:0; color:#64748B; font-size:13px; text-transform:uppercase; font-weight:600;">Terminales Conciliados</h3>
                    <p style="margin:8px 0 0 0; font-size:32px; font-weight:700; color:#10D07A;">${totalAprobados}</p>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; align-items: start;">
                <div class="upload-container" style="background:#fff; padding:20px; border-radius:8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin:0;">
                    <h3 style="color: var(--azul-corporativo); font-size:16px; margin-bottom:16px; text-align:center;">Estatus General de Auditoría</h3>
                    <canvas id="graficaEstatus" style="max-height: 250px;"></canvas>
                </div>
                <div class="upload-container" style="background:#fff; padding:20px; border-radius:8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin:0;">
                    <h3 style="color: var(--azul-corporativo); font-size:16px; margin-bottom:16px; text-align:center;">Top Causales de Rechazos</h3>
                    <canvas id="graficaTopRechazos" style="max-height: 250px;"></canvas>
                </div>
                <div class="upload-container" style="grid-column: 1 / -1; background:#fff; padding:20px; border-radius:8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin:0;">
                    <h3 style="color: var(--azul-corporativo); font-size:16px; margin-bottom:16px;">Volumen de Incidencias Registradas por Entidad Bancaria</h3>
                    <canvas id="graficaVolumenBancos" style="max-height: 280px;"></canvas>
                </div>
            </div>
        </div>
    `;

    renderizarEstructuraBasePortal(htmlDashboard);
    destruirGraficosDashboard();

    const ctxEstatus = document.getElementById('graficaEstatus').getContext('2d');
    graficoIncidenciasInstance = new Chart(ctxEstatus, {
        type: 'doughnut',
        data: {
            labels: ['Conciliados Exitosos', 'Incidencias / Rechazos'],
            datasets: [{
                data: [totalAprobados, totalIncidentes],
                backgroundColor: ['#10D07A', '#E63946'],
                borderWidth: 2,
                borderColor: '#FFFFFF'
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    const ctxRechazos = document.getElementById('graficaTopRechazos').getContext('2d');
    graficoTopRechazosInstance = new Chart(ctxRechazos, {
        type: 'pie',
        data: {
            labels: rechazosLabels.length > 0 ? rechazosLabels : ['Sin registros'],
            datasets: [{
                data: rechazosData.length > 0 ? rechazosData : [0],
                backgroundColor: ['#F59E0B', '#3B82F6', '#EF4444', '#8B5CF6', '#EC4899'],
                borderWidth: 1
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    const ctxBancos = document.getElementById('graficaVolumenBancos').getContext('2d');
    graficoVolumenBancosInstance = new Chart(ctxBancos, {
        type: 'bar',
        data: {
            labels: bancosLabels.length > 0 ? bancosLabels : ['Sin datos'],
            datasets: [{
                label: 'Cantidad de Casos',
                data: bancosData.length > 0 ? bancosData : [0],
                backgroundColor: '#1E293B',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
            plugins: { legend: { display: false } }
        }
    });
}

function renderizarEstructuraBasePortal(contenidoDinamico) {
    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="nav-bar-portal">
            <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Panel Analítico General - Vepagos</h3>
            <div style="display:flex; gap:10px;">
                <button id="btn-dash-regresar-tickets" class="btn-primary" style="background-color: #1E293B;">🎫 Ver Tickets</button>
                <button id="btn-dash-regresar-operaciones" class="btn-primary" style="background-color: #475569;">📁 Operaciones</button>
            </div>
        </div>
        <div class="dashboard-wrapper" style="padding: 20px; max-width: 1200px; margin: 0 auto;">
            ${contenidoDinamico}
        </div>
    `;

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
