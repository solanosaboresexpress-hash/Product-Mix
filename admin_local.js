(function () {
  const DOC_TYPES = [
    'FUMIGACION',
    'OBLEA_MATAFUEGOS',
    'ANALISIS_AGUA',
    'REBA',
    'POLIZA_SEGURO',
    'HABILITACION_MUNICIPAL',
    'CERTIFICADO_HIGIENE'
  ];

  const DOC_LABELS = {
    FUMIGACION: 'Fumigacion',
    OBLEA_MATAFUEGOS: 'Oblea Matafuegos',
    ANALISIS_AGUA: 'Analisis de Agua',
    REBA: 'REBA',
    POLIZA_SEGURO: 'Poliza de Seguro',
    HABILITACION_MUNICIPAL: 'Habilitacion Municipal',
    CERTIFICADO_HIGIENE: 'Certificado de Higiene'
  };

  const COLORS = {
    VIGENTE: '#16a34a',
    POR_VENCER: '#f59e0b',
    VENCIDO: '#dc2626',
    EN_TRAMITE: '#2563eb',
    NO_POSEE: '#6b7280',
    BAJA: '#16a34a',
    MEDIA: '#f59e0b',
    ALTA: '#dc2626',
    CRITICA: '#7f1d1d'
  };

  function esc(value) {
    return window.escapeHtml ? window.escapeHtml(value) : String(value ?? '');
  }

  // Formatear estado para mostrar sin underscore
  function formatEstado(estado) {
    if (!estado) return '';
    return estado.replace(/_/g, ' ');
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDate(value) {
    const parsed = parseDate(value);
    if (!parsed) return 'Sin fecha';
    return parsed.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function daysUntil(value) {
    const parsed = parseDate(value);
    if (!parsed) return null;
    const now = window.getFechaArgentina ? window.getFechaArgentina() : new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const target = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
    return Math.round((target - today) / 86400000);
  }

  function getStatusFromDate(value, emptyStatus) {
    const days = daysUntil(value);
    if (days === null) return { estado: emptyStatus, diasParaVencer: 0 };
    if (days < 0) return { estado: 'VENCIDO', diasParaVencer: days };
    if (days <= 30) return { estado: 'POR_VENCER', diasParaVencer: days };
    return { estado: 'VIGENTE', diasParaVencer: days };
  }

  async function ensureFirebaseReady(usuario) {
    try {
      return FirebaseRegionManager.getFirestore();
    } catch (e) {
      const regionId = localStorage.getItem('region_id') || usuario.regionId;
      if (!regionId) throw e;
      const regiones = await FirebaseRegionManager.cargarRegiones();
      const region = regiones.find((item) => item.id === regionId);
      if (!region) throw e;
      FirebaseRegionManager.initializeFirebase(region);
      return FirebaseRegionManager.getFirestore();
    }
  }

  function buildNotifications(documentos, personal) {
    const items = [];
    documentos.forEach((doc) => {
      if (doc.diasParaVencer === null || doc.diasParaVencer > 30) return;
      items.push({
        titulo: doc.nombreDocumento || DOC_LABELS[doc.tipoDocumento] || doc.tipoDocumento,
        mensaje: doc.diasParaVencer < 0 ? `Vencido hace ${Math.abs(doc.diasParaVencer)} dias` : `Vence en ${doc.diasParaVencer} dias`,
        prioridad: doc.diasParaVencer < 0 ? 'CRITICA' : doc.diasParaVencer <= 7 ? 'ALTA' : 'MEDIA',
        fecha: doc.fechaVencimiento
      });
    });
    personal.forEach((persona) => {
      [['Libreta sanitaria', persona.libretaSanitaria], ['Curso manipulacion', persona.cursoManipulacion]].forEach(([label, cert]) => {
        if (!cert || cert.estado === 'NO_POSEE' || cert.diasParaVencer > 30) return;
        items.push({
          titulo: persona.nombreCompleto,
          mensaje: cert.diasParaVencer < 0 ? `${label} vencido hace ${Math.abs(cert.diasParaVencer)} dias` : `${label} vence en ${cert.diasParaVencer} dias`,
          prioridad: cert.diasParaVencer < 0 ? 'CRITICA' : cert.diasParaVencer <= 7 ? 'ALTA' : 'MEDIA',
          fecha: cert.fechaVencimiento
        });
      });
    });
    const order = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAJA: 1 };
    return items.sort((a, b) => (order[b.prioridad] || 0) - (order[a.prioridad] || 0));
  }

  async function promptAndSaveDocumento(db, localId) {
    const nombreDocumento = prompt('Nombre del documento');
    if (!nombreDocumento) return false;
    const tipoDocumento = prompt(`Tipo de documento (${DOC_TYPES.join(', ')})`, 'FUMIGACION') || 'FUMIGACION';
    const fechaVencimiento = prompt('Fecha de vencimiento (YYYY-MM-DD)', '');
    const empresaResponsable = prompt('Empresa responsable', '') || '';
    const numeroCertificado = prompt('Numero o certificado', '') || '';
    const telefono = prompt('Telefono', '') || '';
    const observaciones = prompt('Observaciones', '') || '';
    const vencimiento = fechaVencimiento ? new Date(fechaVencimiento + 'T00:00:00') : null;
    const estado = getStatusFromDate(vencimiento, 'EN_TRAMITE');
    const id = `doc_${Date.now()}`;
    await db.collection('locales').doc(localId).collection('documentos').doc(id).set({
      id, localId, tipoDocumento, nombreDocumento, fechaVencimiento: vencimiento, fechaEmision: null,
      numeroCertificado, empresaResponsable, telefono, observaciones, archivoUrl: '',
      estado: estado.estado, diasParaVencer: estado.diasParaVencer, creadoEn: new Date(), actualizadoEn: new Date()
    });
    return true;
  }

  // Función mejorada para agregar documento con formulario completo
  async function promptAndSaveDocumento(db, localId) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10002;padding:20px';
    
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,.3)';
    
    modal.innerHTML = `
      <div style="padding:24px;border-bottom:1px solid #e5e7eb;background:#f8fafc">
        <h2 style="margin:0;font-size:20px;font-weight:700;color:#111827">📄 Agregar Documento</h2>
      </div>
      <div style="padding:24px;display:grid;gap:16px">
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Nombre del documento *</label>
          <input type="text" id="doc-nombre" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px" placeholder="Ej: Certificado Anual">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Tipo de documento *</label>
          <select id="doc-tipo" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;background:#fff">
            ${DOC_TYPES.map(t => `<option value="${t}">${DOC_LABELS[t]}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Fecha de vencimiento</label>
          <input type="date" id="doc-vencimiento" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Empresa responsable</label>
          <input type="text" id="doc-empresa" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px" placeholder="Nombre de la empresa">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Número de certificado</label>
          <input type="text" id="doc-numero" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px" placeholder="Número o código">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Teléfono de contacto</label>
          <input type="text" id="doc-telefono" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px" placeholder="Teléfono">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Observaciones</label>
          <textarea id="doc-observaciones" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;min-height:80px;resize:vertical" placeholder="Notas adicionales..."></textarea>
        </div>
      </div>
      <div style="padding:20px 24px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:12px;background:#f8fafc">
        <button id="doc-cancel" style="padding:10px 20px;background:#6b7280;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Cancelar</button>
        <button id="doc-save" style="padding:10px 20px;background:#059669;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">💾 Guardar</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    return new Promise((resolve) => {
      document.getElementById('doc-cancel').onclick = () => {
        overlay.remove();
        resolve(false);
      };
      
      document.getElementById('doc-save').onclick = async () => {
        const nombre = document.getElementById('doc-nombre').value.trim();
        const tipo = document.getElementById('doc-tipo').value;
        const vencimiento = document.getElementById('doc-vencimiento').value;
        const empresa = document.getElementById('doc-empresa').value.trim();
        const numero = document.getElementById('doc-numero').value.trim();
        const telefono = document.getElementById('doc-telefono').value.trim();
        const observaciones = document.getElementById('doc-observaciones').value.trim();
        
        if (!nombre) {
          alert('El nombre del documento es obligatorio');
          return;
        }
        
        const vencimientoDate = vencimiento ? new Date(vencimiento + 'T00:00:00') : null;
        const estado = getStatusFromDate(vencimientoDate, 'EN_TRAMITE');
        const id = `doc_${Date.now()}`;
        
        await db.collection('locales').doc(localId).collection('documentos').doc(id).set({
          id, localId, tipoDocumento: tipo, nombreDocumento: nombre,
          fechaVencimiento: vencimientoDate, fechaEmision: null,
          numeroCertificado: numero, empresaResponsable: empresa,
          telefono, observaciones, archivoUrl: '',
          estado: estado.estado, diasParaVencer: estado.diasParaVencer,
          creadoEn: new Date(), actualizadoEn: new Date()
        });
        
        overlay.remove();
        resolve(true);
      };
    });
  }

  // Función para editar documento
  async function promptAndEditDocumento(db, localId, documento) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10002;padding:20px';
    
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,.3)';
    
    const fechaVenc = documento.fechaVencimiento ? 
      new Date(documento.fechaVencimiento).toISOString().split('T')[0] : '';
    
    modal.innerHTML = `
      <div style="padding:24px;border-bottom:1px solid #e5e7eb;background:#f8fafc">
        <h2 style="margin:0;font-size:20px;font-weight:700;color:#111827">✏️ Editar Documento</h2>
      </div>
      <div style="padding:24px;display:grid;gap:16px">
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Nombre del documento *</label>
          <input type="text" id="doc-nombre" value="${esc(documento.nombreDocumento)}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Tipo de documento *</label>
          <select id="doc-tipo" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;background:#fff">
            ${DOC_TYPES.map(t => `<option value="${t}" ${t === documento.tipoDocumento ? 'selected' : ''}>${DOC_LABELS[t]}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Fecha de vencimiento</label>
          <input type="date" id="doc-vencimiento" value="${fechaVenc}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Empresa responsable</label>
          <input type="text" id="doc-empresa" value="${esc(documento.empresaResponsable || '')}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Número de certificado</label>
          <input type="text" id="doc-numero" value="${esc(documento.numeroCertificado || '')}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Teléfono de contacto</label>
          <input type="text" id="doc-telefono" value="${esc(documento.telefono || '')}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Observaciones</label>
          <textarea id="doc-observaciones" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;min-height:80px;resize:vertical">${esc(documento.observaciones || '')}</textarea>
        </div>
      </div>
      <div style="padding:20px 24px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;gap:12px;background:#f8fafc">
        <button id="doc-delete" style="padding:10px 20px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">🗑️ Eliminar</button>
        <div style="display:flex;gap:12px">
          <button id="doc-cancel" style="padding:10px 20px;background:#6b7280;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Cancelar</button>
          <button id="doc-save" style="padding:10px 20px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">💾 Actualizar</button>
        </div>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    return new Promise((resolve) => {
      document.getElementById('doc-cancel').onclick = () => {
        overlay.remove();
        resolve(false);
      };
      
      document.getElementById('doc-delete').onclick = async () => {
        if (!confirm('¿Estás seguro de eliminar este documento?')) return;
        await db.collection('locales').doc(localId).collection('documentos').doc(documento.id).delete();
        overlay.remove();
        resolve(true);
      };
      
      document.getElementById('doc-save').onclick = async () => {
        const nombre = document.getElementById('doc-nombre').value.trim();
        const tipo = document.getElementById('doc-tipo').value;
        const vencimiento = document.getElementById('doc-vencimiento').value;
        const empresa = document.getElementById('doc-empresa').value.trim();
        const numero = document.getElementById('doc-numero').value.trim();
        const telefono = document.getElementById('doc-telefono').value.trim();
        const observaciones = document.getElementById('doc-observaciones').value.trim();
        
        if (!nombre) {
          alert('El nombre del documento es obligatorio');
          return;
        }
        
        const vencimientoDate = vencimiento ? new Date(vencimiento + 'T00:00:00') : null;
        const estado = getStatusFromDate(vencimientoDate, 'EN_TRAMITE');
        
        await db.collection('locales').doc(localId).collection('documentos').doc(documento.id).update({
          tipoDocumento: tipo, nombreDocumento: nombre,
          fechaVencimiento: vencimientoDate,
          numeroCertificado: numero, empresaResponsable: empresa,
          telefono, observaciones,
          estado: estado.estado, diasParaVencer: estado.diasParaVencer,
          actualizadoEn: new Date()
        });
        
        overlay.remove();
        resolve(true);
      };
    });
  }

  // Función mejorada para agregar personal con formulario completo
  async function promptAndSavePersonal(db, localId) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10002;padding:20px';
    
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,.3)';
    
    modal.innerHTML = `
      <div style="padding:24px;border-bottom:1px solid #e5e7eb;background:#f8fafc">
        <h2 style="margin:0;font-size:20px;font-weight:700;color:#111827">👤 Agregar Personal</h2>
      </div>
      <div style="padding:24px;display:grid;gap:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Nombre *</label>
            <input type="text" id="per-nombre" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Apellido *</label>
            <input type="text" id="per-apellido" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">DNI *</label>
          <input type="text" id="per-dni" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px" placeholder="Número de DNI">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Cargo *</label>
          <input type="text" id="per-cargo" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px" placeholder="Ej: Encargado, Mozo">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Teléfono</label>
            <input type="text" id="per-telefono" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Email</label>
            <input type="email" id="per-email" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Fecha de ingreso</label>
          <input type="date" id="per-ingreso" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        </div>
        <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:12px">
            <input type="checkbox" id="per-tiene-libreta" style="width:18px;height:18px">
            <span style="font-size:14px;font-weight:600;color:#374151">Posee Libreta Sanitaria</span>
          </label>
          <div id="per-libreta-container" style="display:none;padding-left:28px">
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Vencimiento libreta</label>
            <input type="date" id="per-libreta-venc" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
        </div>
        <div style="border-top:1px solid #e5e7eb;padding-top:16px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:12px">
            <input type="checkbox" id="per-tiene-curso" style="width:18px;height:18px">
            <span style="font-size:14px;font-weight:600;color:#374151">Posee Curso de Manipulación</span>
          </label>
          <div id="per-curso-container" style="display:none;padding-left:28px">
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Vencimiento curso</label>
            <input type="date" id="per-curso-venc" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
        </div>
      </div>
      <div style="padding:20px 24px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:12px;background:#f8fafc">
        <button id="per-cancel" style="padding:10px 20px;background:#6b7280;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Cancelar</button>
        <button id="per-save" style="padding:10px 20px;background:#059669;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">💾 Guardar</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Toggle libreta
    document.getElementById('per-tiene-libreta').onchange = (e) => {
      document.getElementById('per-libreta-container').style.display = e.target.checked ? 'block' : 'none';
    };
    
    // Toggle curso
    document.getElementById('per-tiene-curso').onchange = (e) => {
      document.getElementById('per-curso-container').style.display = e.target.checked ? 'block' : 'none';
    };
    
    return new Promise((resolve) => {
      document.getElementById('per-cancel').onclick = () => {
        overlay.remove();
        resolve(false);
      };
      
      document.getElementById('per-save').onclick = async () => {
        const nombre = document.getElementById('per-nombre').value.trim();
        const apellido = document.getElementById('per-apellido').value.trim();
        const dni = document.getElementById('per-dni').value.trim();
        const cargo = document.getElementById('per-cargo').value.trim();
        const telefono = document.getElementById('per-telefono').value.trim();
        const email = document.getElementById('per-email').value.trim();
        const ingreso = document.getElementById('per-ingreso').value;
        const tieneLibreta = document.getElementById('per-tiene-libreta').checked;
        const tieneCurso = document.getElementById('per-tiene-curso').checked;
        const libretaVenc = document.getElementById('per-libreta-venc').value;
        const cursoVenc = document.getElementById('per-curso-venc').value;
        
        if (!nombre || !apellido || !dni || !cargo) {
          alert('Nombre, Apellido, DNI y Cargo son obligatorios');
          return;
        }
        
        const libretaDate = tieneLibreta && libretaVenc ? new Date(libretaVenc + 'T00:00:00') : null;
        const cursoDate = tieneCurso && cursoVenc ? new Date(cursoVenc + 'T00:00:00') : null;
        const libreta = getStatusFromDate(libretaDate, 'NO_POSEE');
        const curso = getStatusFromDate(cursoDate, 'NO_POSEE');
        const ingresoDate = ingreso ? new Date(ingreso + 'T00:00:00') : null;
        
        const id = `per_${Date.now()}`;
        await db.collection('locales').doc(localId).collection('personal').doc(id).set({
          id, localId, nombre, apellido, dni, cargo, telefono, email,
          fechaIngreso: ingresoDate, estado: 'ACTIVO',
          libretaSanitaria: libretaDate ? {
            numeroLibreta: '', fechaEmision: null, fechaVencimiento: libretaDate,
            categoria: '', estado: libreta.estado, diasParaVencer: libreta.diasParaVencer, archivoUrl: ''
          } : null,
          cursoManipulacion: cursoDate ? {
            institucion: '', tipoCurso: '', fechaEmision: null, fechaVencimiento: cursoDate,
            numeroCertificado: '', estado: curso.estado, diasParaVencer: curso.diasParaVencer, archivoUrl: ''
          } : null,
          creadoEn: new Date(), actualizadoEn: new Date()
        });
        
        overlay.remove();
        resolve(true);
      };
    });
  }

  // Función para editar personal
  async function promptAndEditPersonal(db, localId, personal) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10002;padding:20px';
    
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,.3)';
    
    const fechaIngreso = personal.fechaIngreso ? new Date(personal.fechaIngreso).toISOString().split('T')[0] : '';
    const fechaLibreta = personal.libretaSanitaria?.fechaVencimiento ? 
      new Date(personal.libretaSanitaria.fechaVencimiento).toISOString().split('T')[0] : '';
    const fechaCurso = personal.cursoManipulacion?.fechaVencimiento ? 
      new Date(personal.cursoManipulacion.fechaVencimiento).toISOString().split('T')[0] : '';
    const tieneLibreta = !!personal.libretaSanitaria;
    const tieneCurso = !!personal.cursoManipulacion;
    
    modal.innerHTML = `
      <div style="padding:24px;border-bottom:1px solid #e5e7eb;background:#f8fafc">
        <h2 style="margin:0;font-size:20px;font-weight:700;color:#111827">✏️ Editar Personal</h2>
      </div>
      <div style="padding:24px;display:grid;gap:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Nombre *</label>
            <input type="text" id="per-nombre" value="${esc(personal.nombre)}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Apellido *</label>
            <input type="text" id="per-apellido" value="${esc(personal.apellido)}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">DNI *</label>
          <input type="text" id="per-dni" value="${esc(personal.dni)}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Cargo *</label>
          <input type="text" id="per-cargo" value="${esc(personal.cargo)}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Teléfono</label>
            <input type="text" id="per-telefono" value="${esc(personal.telefono || '')}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Email</label>
            <input type="email" id="per-email" value="${esc(personal.email || '')}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Fecha de ingreso</label>
          <input type="date" id="per-ingreso" value="${fechaIngreso}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
        </div>
        <div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:12px">
            <input type="checkbox" id="per-tiene-libreta" ${tieneLibreta ? 'checked' : ''} style="width:18px;height:18px">
            <span style="font-size:14px;font-weight:600;color:#374151">Posee Libreta Sanitaria</span>
          </label>
          <div id="per-libreta-container" style="${tieneLibreta ? '' : 'display:none'};padding-left:28px">
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Vencimiento libreta</label>
            <input type="date" id="per-libreta-venc" value="${fechaLibreta}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
        </div>
        <div style="border-top:1px solid #e5e7eb;padding-top:16px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:12px">
            <input type="checkbox" id="per-tiene-curso" ${tieneCurso ? 'checked' : ''} style="width:18px;height:18px">
            <span style="font-size:14px;font-weight:600;color:#374151">Posee Curso de Manipulación</span>
          </label>
          <div id="per-curso-container" style="${tieneCurso ? '' : 'display:none'};padding-left:28px">
            <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">Vencimiento curso</label>
            <input type="date" id="per-curso-venc" value="${fechaCurso}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
          </div>
        </div>
      </div>
      <div style="padding:20px 24px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;gap:12px;background:#f8fafc">
        <button id="per-delete" style="padding:10px 20px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">🗑️ Eliminar</button>
        <div style="display:flex;gap:12px">
          <button id="per-cancel" style="padding:10px 20px;background:#6b7280;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Cancelar</button>
          <button id="per-save" style="padding:10px 20px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">💾 Actualizar</button>
        </div>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    document.getElementById('per-tiene-libreta').onchange = (e) => {
      document.getElementById('per-libreta-container').style.display = e.target.checked ? 'block' : 'none';
    };
    
    document.getElementById('per-tiene-curso').onchange = (e) => {
      document.getElementById('per-curso-container').style.display = e.target.checked ? 'block' : 'none';
    };
    
    return new Promise((resolve) => {
      document.getElementById('per-cancel').onclick = () => {
        overlay.remove();
        resolve(false);
      };
      
      document.getElementById('per-delete').onclick = async () => {
        if (!confirm('¿Estás seguro de eliminar este empleado?')) return;
        await db.collection('locales').doc(localId).collection('personal').doc(personal.id).delete();
        overlay.remove();
        resolve(true);
      };
      
      document.getElementById('per-save').onclick = async () => {
        const nombre = document.getElementById('per-nombre').value.trim();
        const apellido = document.getElementById('per-apellido').value.trim();
        const dni = document.getElementById('per-dni').value.trim();
        const cargo = document.getElementById('per-cargo').value.trim();
        const telefono = document.getElementById('per-telefono').value.trim();
        const email = document.getElementById('per-email').value.trim();
        const ingreso = document.getElementById('per-ingreso').value;
        const tieneLibreta = document.getElementById('per-tiene-libreta').checked;
        const tieneCurso = document.getElementById('per-tiene-curso').checked;
        const libretaVenc = document.getElementById('per-libreta-venc').value;
        const cursoVenc = document.getElementById('per-curso-venc').value;
        
        if (!nombre || !apellido || !dni || !cargo) {
          alert('Nombre, Apellido, DNI y Cargo son obligatorios');
          return;
        }
        
        const libretaDate = tieneLibreta && libretaVenc ? new Date(libretaVenc + 'T00:00:00') : null;
        const cursoDate = tieneCurso && cursoVenc ? new Date(cursoVenc + 'T00:00:00') : null;
        const libreta = getStatusFromDate(libretaDate, 'NO_POSEE');
        const curso = getStatusFromDate(cursoDate, 'NO_POSEE');
        const ingresoDate = ingreso ? new Date(ingreso + 'T00:00:00') : null;
        
        await db.collection('locales').doc(localId).collection('personal').doc(personal.id).update({
          nombre, apellido, dni, cargo, telefono, email,
          fechaIngreso: ingresoDate,
          libretaSanitaria: libretaDate ? {
            numeroLibreta: personal.libretaSanitaria?.numeroLibreta || '',
            fechaEmision: personal.libretaSanitaria?.fechaEmision || null,
            fechaVencimiento: libretaDate,
            categoria: personal.libretaSanitaria?.categoria || '',
            estado: libreta.estado, diasParaVencer: libreta.diasParaVencer,
            archivoUrl: personal.libretaSanitaria?.archivoUrl || ''
          } : null,
          cursoManipulacion: cursoDate ? {
            institucion: personal.cursoManipulacion?.institucion || '',
            tipoCurso: personal.cursoManipulacion?.tipoCurso || '',
            fechaEmision: personal.cursoManipulacion?.fechaEmision || null,
            fechaVencimiento: cursoDate,
            numeroCertificado: personal.cursoManipulacion?.numeroCertificado || '',
            estado: curso.estado, diasParaVencer: curso.diasParaVencer,
            archivoUrl: personal.cursoManipulacion?.archivoUrl || ''
          } : null,
          actualizadoEn: new Date()
        });
        
        overlay.remove();
        resolve(true);
      };
    });
  }

  window.openAdministracionLocalModal = async function () {
    const rawUser = localStorage.getItem('usuario');
    if (!rawUser) {
      alert('Inicie sesion primero.');
      return;
    }
    const usuario = JSON.parse(rawUser);
    if (!usuario.localId) {
      alert('No se encontro el local actual.');
      return;
    }

    const db = await ensureFirebaseReady(usuario);
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:10001;padding:8px';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;width:100%;max-width:1100px;max-height:95vh;overflow:hidden;border-radius:12px;display:flex;flex-direction:column';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb;flex-wrap:wrap;gap:8px';
    header.innerHTML = `<div style="font-weight:700;font-size:18px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Administracion · ${esc(usuario.localNombre || 'Local')}</div><div style="display:flex;gap:6px;flex-shrink:0"><button id="admin-refresh" style="padding:8px 12px;background:#059669;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:13px">↻ Recargar</button><button id="admin-close" style="padding:8px 12px;background:#6b7280;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:13px">✕ Cerrar</button></div>`;
    modal.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'padding:12px;overflow:auto;background:#e5e7eb;flex:1;-webkit-overflow-scrolling:touch';
    modal.appendChild(body);

    const state = { section: 'documentos', documentos: [], personal: [], notificaciones: [] };

    async function loadData() {
      body.innerHTML = '<div style="padding:32px;text-align:center;color:#6b7280">Cargando administracion del local...</div>';
      const [docsSnap, peopleSnap] = await Promise.all([
        db.collection('locales').doc(usuario.localId).collection('documentos').get(),
        db.collection('locales').doc(usuario.localId).collection('personal').get()
      ]);

      state.documentos = docsSnap.docs.map((doc) => {
        const data = doc.data();
        const status = getStatusFromDate(data.fechaVencimiento, data.estado || 'EN_TRAMITE');
        return { ...data, id: doc.id, fechaVencimiento: parseDate(data.fechaVencimiento), estado: status.estado, diasParaVencer: status.diasParaVencer };
      });

      state.personal = peopleSnap.docs.map((doc) => {
        const data = doc.data();
        const libretaDate = parseDate(data.libretaSanitaria?.fechaVencimiento);
        const cursoDate = parseDate(data.cursoManipulacion?.fechaVencimiento);
        const libreta = data.libretaSanitaria ? { ...data.libretaSanitaria, fechaVencimiento: libretaDate, ...getStatusFromDate(libretaDate, 'NO_POSEE') } : null;
        const curso = data.cursoManipulacion ? { ...data.cursoManipulacion, fechaVencimiento: cursoDate, ...getStatusFromDate(cursoDate, 'NO_POSEE') } : null;
        return { ...data, id: doc.id, nombreCompleto: `${data.nombre || ''} ${data.apellido || ''}`.trim(), libretaSanitaria: libreta, cursoManipulacion: curso };
      });

      state.notificaciones = buildNotifications(state.documentos, state.personal);
      render();
    }

    // Animación de entrada para cards
    function animateCardIn(element, delay = 0) {
      element.style.opacity = '0';
      element.style.transform = 'translateY(20px)';
      element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      setTimeout(() => {
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
      }, delay);
    }

    function statCard(label, value, color, section, icon) {
      const isActive = state.section === section;
      return `
        <button data-section="${section}" style="
          border:${isActive ? '3px solid ' + color : '2px solid #e5e7eb'};
          background:${isActive ? '#fff' : '#f9fafb'};
          border-radius:16px;
          padding:20px 16px;
          text-align:center;
          box-shadow:${isActive ? '0 8px 16px rgba(0,0,0,.12)' : '0 2px 4px rgba(0,0,0,.05)'};
          cursor:pointer;
          transition:all 0.2s ease;
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:8px;
        " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 16px rgba(0,0,0,.12)'" 
           onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='${isActive ? '0 8px 16px rgba(0,0,0,.12)' : '0 2px 4px rgba(0,0,0,.05)'}'">
          <div style="font-size:32px">${icon}</div>
          <div style="font-size:32px;font-weight:800;color:${color};line-height:1">${value}</div>
          <div style="font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.5px">${label}</div>
        </button>
      `;
    }

    function renderDocumentoCard(doc, index) {
      const diasText = doc.diasParaVencer !== null && doc.diasParaVencer !== undefined
        ? (doc.diasParaVencer < 0 
            ? `🔴 Vencido hace ${Math.abs(doc.diasParaVencer)} días` 
            : doc.diasParaVencer <= 30 
              ? `⚠️ Vence en ${doc.diasParaVencer} días` 
              : `✅ Vence en ${doc.diasParaVencer} días`)
        : 'Sin fecha';
      
      const estadoColor = COLORS[doc.estado] || '#6b7280';
      
      return `
        <div class="admin-card" data-id="${esc(doc.id)}" style="
          background:#fff;
          border-radius:16px;
          padding:20px;
          box-shadow:0 4px 12px rgba(0,0,0,.08);
          border-left:5px solid ${estadoColor};
          cursor:pointer;
          transition:all 0.2s ease;
        " onmouseover="this.style.transform='translateX(4px)';this.style.boxShadow='0 8px 20px rgba(0,0,0,.12)'" 
           onmouseout="this.style.transform='translateX(0)';this.style.boxShadow='0 4px 12px rgba(0,0,0,.08)'">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px">
            <div style="flex:1;min-width:0">
              <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(doc.nombreDocumento)}</div>
              <div style="font-size:13px;color:#6b7280;font-weight:500">${esc(DOC_LABELS[doc.tipoDocumento] || doc.tipoDocumento)}</div>
            </div>
            <span style="
              background:${estadoColor};
              color:#fff;
              border-radius:20px;
              padding:6px 14px;
              font-size:12px;
              font-weight:700;
              text-transform:uppercase;
              letter-spacing:0.5px;
              white-space:nowrap;
            ">${formatEstado(doc.estado)}</span>
          </div>
          
          <div style="display:grid;gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6">
            <div style="display:flex;align-items:center;gap:8px;font-size:14px;color:#374151">
              <span style="font-size:16px">📅</span>
              <span style="font-weight:600">${diasText}</span>
            </div>
            ${doc.empresaResponsable ? `
              <div style="display:flex;align-items:center;gap:8px;font-size:14px;color:#4b5563">
                <span style="font-size:16px">🏢</span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(doc.empresaResponsable)}</span>
              </div>
            ` : ''}
            ${doc.telefono ? `
              <div style="display:flex;align-items:center;gap:8px;font-size:14px;color:#4b5563">
                <span style="font-size:16px">📞</span>
                <span>${esc(doc.telefono)}</span>
              </div>
            ` : ''}
            ${doc.numeroCertificado ? `
              <div style="display:flex;align-items:center;gap:8px;font-size:14px;color:#4b5563">
                <span style="font-size:16px">📝</span>
                <span style="font-family:monospace">${esc(doc.numeroCertificado)}</span>
              </div>
            ` : ''}
            ${doc.observaciones ? `
              <div style="margin-top:8px;padding:10px;background:#f9fafb;border-radius:8px;font-size:13px;color:#6b7280;word-break:break-word">
                💬 ${esc(doc.observaciones)}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    function renderPersonalCard(persona, index) {
      const libretaEstado = persona.libretaSanitaria?.estado || 'NO_POSEE';
      const cursoEstado = persona.cursoManipulacion?.estado || 'NO_POSEE';
      const libretaColor = COLORS[libretaEstado] || '#6b7280';
      const cursoColor = COLORS[cursoEstado] || '#6b7280';
      
      return `
        <div class="admin-card" data-id="${esc(persona.id)}" style="
          background:#fff;
          border-radius:16px;
          padding:20px;
          box-shadow:0 4px 12px rgba(0,0,0,.08);
          cursor:pointer;
          transition:all 0.2s ease;
        " onmouseover="this.style.transform='translateX(4px)';this.style.boxShadow='0 8px 20px rgba(0,0,0,.12)'" 
           onmouseout="this.style.transform='translateX(0)';this.style.boxShadow='0 4px 12px rgba(0,0,0,.08)'">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px">
            <div style="flex:1;min-width:0">
              <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(persona.nombreCompleto)}</div>
              <div style="font-size:13px;color:#6b7280;font-weight:500">${esc(persona.cargo || 'Sin cargo')} · DNI ${esc(persona.dni || 'Sin dato')}</div>
            </div>
          </div>
          
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
            <span style="
              background:${libretaColor}15;
              color:${libretaColor};
              border:2px solid ${libretaColor}30;
              border-radius:20px;
              padding:6px 12px;
              font-size:12px;
              font-weight:700;
              display:flex;align-items:center;gap:6px;
            ">
              🏥 Libreta: ${formatEstado(libretaEstado)}
            </span>
            <span style="
              background:${cursoColor}15;
              color:${cursoColor};
              border:2px solid ${cursoColor}30;
              border-radius:20px;
              padding:6px 12px;
              font-size:12px;
              font-weight:700;
              display:flex;align-items:center;gap:6px;
            ">
              📚 Curso: ${formatEstado(cursoEstado)}
            </span>
          </div>
          
          <div style="display:grid;gap:6px;margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6">
            ${persona.telefono ? `
              <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#4b5563">
                <span>📞</span>
                <span>${esc(persona.telefono)}</span>
              </div>
            ` : ''}
            ${persona.email ? `
              <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#4b5563;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                <span>✉️</span>
                <span>${esc(persona.email)}</span>
              </div>
            ` : ''}
            ${persona.fechaIngreso ? `
              <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#4b5563">
                <span>📅</span>
                <span>Ingreso: ${formatDate(persona.fechaIngreso)}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    function renderNotificacionCard(notif, index) {
      const prioridadColor = COLORS[notif.prioridad] || '#6b7280';
      const prioridadIcon = notif.prioridad === 'CRITICA' ? '🔴' : notif.prioridad === 'ALTA' ? '🟠' : notif.prioridad === 'MEDIA' ? '🟡' : '🔵';
      
      return `
        <div style="
          background:#fff;
          border-radius:16px;
          padding:18px;
          box-shadow:0 4px 12px rgba(0,0,0,.08);
          border-left:5px solid ${prioridadColor};
        ">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">
            <div style="flex:1;min-width:0">
              <div style="font-size:17px;font-weight:700;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${prioridadIcon} ${esc(notif.titulo)}</div>
            </div>
            <span style="
              background:${prioridadColor};
              color:#fff;
              border-radius:20px;
              padding:6px 14px;
              font-size:11px;
              font-weight:700;
              text-transform:uppercase;
              letter-spacing:0.5px;
              white-space:nowrap;
            ">${esc(notif.prioridad)}</span>
          </div>
          <div style="font-size:14px;color:#374151;margin-top:8px;line-height:1.5">${esc(notif.mensaje)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:10px;display:flex;align-items:center;gap:6px">
            <span>📅</span>
            <span>Vence: ${esc(formatDate(notif.fecha))}</span>
          </div>
        </div>
      `;
    }

    function render() {
      const sectionTitle = state.section === 'documentos' ? '📄 Documentos del local' : state.section === 'personal' ? '👥 Personal del local' : '🔔 Alertas activas';
      const sectionItems = state.section === 'documentos' ? state.documentos : state.section === 'personal' ? state.personal : state.notificaciones;
      
      let sectionHtml;
      if (sectionItems.length === 0) {
        sectionHtml = `
          <div style="
            background:#fff;
            border-radius:20px;
            padding:48px 32px;
            text-align:center;
            box-shadow:0 4px 12px rgba(0,0,0,.08);
          ">
            <div style="font-size:64px;margin-bottom:16px">📭</div>
            <div style="font-size:18px;font-weight:700;color:#6b7280;margin-bottom:8px">Sin datos cargados</div>
            <div style="font-size:14px;color:#9ca3af">${state.section === 'documentos' ? 'Agrega documentos usando el botón +' : state.section === 'personal' ? 'Agrega empleados usando el botón +' : 'No hay alertas activas 🎉'}</div>
          </div>
        `;
      } else {
        sectionHtml = sectionItems.map((item, idx) => {
          if (state.section === 'documentos') return renderDocumentoCard(item, idx);
          if (state.section === 'personal') return renderPersonalCard(item, idx);
          return renderNotificacionCard(item, idx);
        }).join('');
      }

      body.innerHTML = `
        <style>
          @keyframes slideInUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .admin-card {
            animation: slideInUp 0.4s ease forwards;
          }
          .fab-button {
            position: fixed;
            bottom: 16px;
            right: 16px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #C59B34 0%, #b8942e 100%);
            color: #fff;
            border: none;
            box-shadow: 0 4px 12px rgba(197, 155, 52, 0.4);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            font-weight: 300;
            transition: all 0.2s ease;
            z-index: 1000;
          }
          .fab-button:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 20px rgba(197, 155, 52, 0.5);
          }
          .fab-button:active {
            transform: scale(0.95);
          }
          /* Responsive para móviles */
          @media (max-width: 768px) {
            .admin-stats-grid {
              grid-template-columns: 1fr !important;
            }
            .admin-stats-grid > button {
              flex-direction: row !important;
              justify-content: flex-start !important;
              padding: 12px 16px !important;
              text-align: left !important;
            }
            .admin-stats-grid > button > div:first-child {
              font-size: 28px !important;
            }
            .admin-stats-grid > button > div:nth-child(2) {
              font-size: 24px !important;
              margin-left: auto !important;
            }
            .admin-stats-grid > button > div:last-child {
              display: none !important;
            }
            .section-header {
              flex-direction: column !important;
              align-items: flex-start !important;
              gap: 8px !important;
            }
            .section-title {
              font-size: 18px !important;
            }
          }
        </style>
        
        <!-- Tarjetas de estadísticas -->
        <div class="admin-stats-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:24px">
          ${statCard('Documentos', state.documentos.length, '#16a34a', 'documentos', '📄')}
          ${statCard('Personal', state.personal.length, '#2563eb', 'personal', '👤')}
          ${statCard('Alertas', state.notificaciones.length, '#f59e0b', 'alertas', '🔔')}
        </div>
        
        <!-- Header de sección -->
        <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e5e7eb">
          <div class="section-title" style="font-size:22px;font-weight:800;color:#111827;display:flex;align-items:center;gap:10px">
            ${sectionTitle}
          </div>
          <div style="font-size:14px;color:#6b7280;font-weight:500">
            ${sectionItems.length} ${sectionItems.length === 1 ? 'elemento' : 'elementos'}
          </div>
        </div>
        
        <!-- Lista de items -->
        <div style="display:grid;gap:14px;padding-bottom:80px">
          ${sectionHtml}
        </div>
        
        <!-- FAB flotante -->
        ${state.section !== 'alertas' ? `
          <button class="fab-button" id="admin-fab-add" title="${state.section === 'documentos' ? 'Agregar documento' : 'Agregar personal'}">
            +
          </button>
        ` : ''}
      `;
      
      // Animar cards
      const cards = body.querySelectorAll('.admin-card');
      cards.forEach((card, idx) => {
        card.style.animationDelay = `${idx * 0.05}s`;
      });
      
      // Event listeners para tabs
      body.querySelectorAll('[data-section]').forEach((button) => { 
        button.onclick = () => { 
          state.section = button.dataset.section; 
          render(); 
        }; 
      });
      
      // Event listeners para cards (editar al hacer clic)
      if (state.section === 'documentos') {
        body.querySelectorAll('.admin-card').forEach(card => {
          card.onclick = async () => {
            const docId = card.dataset.id;
            const doc = state.documentos.find(d => d.id === docId);
            if (doc && await promptAndEditDocumento(db, usuario.localId, doc)) {
              await loadData();
            }
          };
        });
      } else if (state.section === 'personal') {
        body.querySelectorAll('.admin-card').forEach(card => {
          card.onclick = async () => {
            const perId = card.dataset.id;
            const per = state.personal.find(p => p.id === perId);
            if (per && await promptAndEditPersonal(db, usuario.localId, per)) {
              await loadData();
            }
          };
        });
      }
      
      // FAB button
      const fab = document.getElementById('admin-fab-add');
      if (fab) {
        fab.onclick = async () => {
          if (state.section === 'documentos') {
            if (await promptAndSaveDocumento(db, usuario.localId)) await loadData();
          } else if (state.section === 'personal') {
            if (await promptAndSavePersonal(db, usuario.localId)) await loadData();
          }
        };
      }
    }

    document.getElementById('admin-close').onclick = () => overlay.remove();
    document.getElementById('admin-refresh').onclick = () => loadData();
    await loadData();
  };
})();
