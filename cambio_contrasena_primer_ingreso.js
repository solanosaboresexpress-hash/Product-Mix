// Modal de Cambio de Contraseña para Primer Ingreso
// Se carga dinámicamente cuando se detecta primer ingreso

window.cambioContrasenaCallback = null;
window.modalCreado = false;

window.crearModalCambioContrasena = function() {
  if (window.modalCreado) return;
  
  const modalHTML = `
    <div id="modalCambioContrasenaPrimerIngreso" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10000;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;">
      <div style="background:rgba(30,41,59,0.95);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(197,155,52,0.35);padding:32px;border-radius:24px;max-width:420px;width:100%;box-shadow:0 25px 50px rgba(0,0,0,0.5);box-sizing:border-box;">
        <h2 style="margin:0 0 12px 0;background:linear-gradient(135deg,#C59B34,#E6C874);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;font-size:22px;font-weight:800;">🔑 Cambio de Contraseña</h2>
        <p style="margin:0 0 24px 0;color:#94a3b8;text-align:center;font-size:14px;line-height:1.5;">
          Es tu primer ingreso. Por seguridad, debes cambiar tu contraseña para continuar.
        </p>
        
        <div style="margin-bottom:16px;">
          <label style="display:block;margin-bottom:8px;color:#E6C874;font-weight:600;font-size:13px;">Nueva Contraseña</label>
          <input type="password" id="inputNuevaContrasena" placeholder="Mínimo 6 caracteres" 
                 style="width:100%;padding:14px 16px;border:2px solid rgba(197,155,52,0.35);border-radius:14px;font-size:16px;box-sizing:border-box;background:rgba(15,23,42,0.6);color:#f1f5f9;transition:box-shadow 0.2s ease;">
        </div>
        
        <div style="margin-bottom:20px;">
          <label style="display:block;margin-bottom:8px;color:#E6C874;font-weight:600;font-size:13px;">Confirmar Contraseña</label>
          <input type="password" id="inputConfirmarContrasena" placeholder="Repite la nueva contraseña" 
                 style="width:100%;padding:14px 16px;border:2px solid rgba(197,155,52,0.35);border-radius:14px;font-size:16px;box-sizing:border-box;background:rgba(15,23,42,0.6);color:#f1f5f9;transition:box-shadow 0.2s ease;">
        </div>
        
        <div id="errorContrasena" style="margin-bottom:16px;color:#f87171;font-size:14px;display:none;text-align:center;"></div>
        
        <div style="display:flex;gap:12px;">
          <button id="btnCancelarCambio" 
                  style="flex:1;padding:14px;border:1px solid rgba(148,163,184,0.3);background:rgba(100,116,139,0.35);color:#f1f5f9;border-radius:14px;cursor:pointer;font-size:15px;font-weight:600;transition:transform 0.2s ease;">
            Cancelar
          </button>
          <button id="btnConfirmarCambio" 
                  style="flex:1;padding:14px;border:none;background:linear-gradient(135deg,#C59B34,#E6C874);color:#0f172a;border-radius:14px;cursor:pointer;font-size:15px;font-weight:800;box-shadow:0 4px 16px rgba(197,155,52,0.35);transition:transform 0.2s ease;">
            Cambiar Contraseña
          </button>
        </div>
      </div>
    </div>
  `;

  const insertarModal = function() {
    if (document.body) {
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      window.modalCreado = true;
      configurarEventListeners();
    }
  };

  if (document.body) {
    insertarModal();
  } else {
    document.addEventListener('DOMContentLoaded', insertarModal);
  }
};

function configurarEventListeners() {
  const inputs = ['inputNuevaContrasena', 'inputConfirmarContrasena'];
  inputs.forEach(function(id) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('focus', function() {
        this.style.boxShadow = '0 0 0 4px rgba(197,155,52,0.2)';
        this.style.borderColor = '#C59B34';
      });
      el.addEventListener('blur', function() {
        this.style.boxShadow = 'none';
        this.style.borderColor = 'rgba(197,155,52,0.35)';
      });
    }
  });

  document.getElementById('btnCancelarCambio').addEventListener('click', function() {
    window.ocultarModalCambioContrasena();
    if (window.cambioContrasenaCallback) {
      window.cambioContrasenaCallback(null, true);
    }
  });

  document.getElementById('btnConfirmarCambio').addEventListener('click', function() {
    const inputNueva = document.getElementById('inputNuevaContrasena');
    const inputConfirmar = document.getElementById('inputConfirmarContrasena');
    const errorDiv = document.getElementById('errorContrasena');
    
    const nuevaContrasena = inputNueva.value.trim();
    const confirmarContrasena = inputConfirmar.value.trim();
    
    if (!nuevaContrasena) {
      errorDiv.textContent = 'La contraseña es requerida';
      errorDiv.style.display = 'block';
      return;
    }
    
    if (nuevaContrasena.length < 6) {
      errorDiv.textContent = 'La contraseña debe tener al menos 6 caracteres';
      errorDiv.style.display = 'block';
      return;
    }
    
    if (nuevaContrasena === window.PASSWORD_INICIAL_LOCAL) {
      errorDiv.textContent = 'No puedes usar la contraseña temporal por defecto';
      errorDiv.style.display = 'block';
      return;
    }
    
    if (!confirmarContrasena) {
      errorDiv.textContent = 'Debes confirmar la contraseña';
      errorDiv.style.display = 'block';
      return;
    }
    
    if (nuevaContrasena !== confirmarContrasena) {
      errorDiv.textContent = 'Las contraseñas no coinciden';
      errorDiv.style.display = 'block';
      return;
    }
    
    window.ocultarModalCambioContrasena();
    if (window.cambioContrasenaCallback) {
      window.cambioContrasenaCallback(nuevaContrasena, false);
    }
  });

  document.getElementById('inputConfirmarContrasena').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      document.getElementById('btnConfirmarCambio').click();
    }
  });
}

window.mostrarModalCambioContrasena = function(callback) {
  if (!window.modalCreado) {
    window.crearModalCambioContrasena();
  }
  
  const modal = document.getElementById('modalCambioContrasenaPrimerIngreso');
  const inputNueva = document.getElementById('inputNuevaContrasena');
  const inputConfirmar = document.getElementById('inputConfirmarContrasena');
  const errorDiv = document.getElementById('errorContrasena');
  
  inputNueva.value = '';
  inputConfirmar.value = '';
  errorDiv.style.display = 'none';
  
  window.cambioContrasenaCallback = callback;
  modal.style.display = 'flex';
  
  setTimeout(() => inputNueva.focus(), 100);
};

window.ocultarModalCambioContrasena = function() {
  const modal = document.getElementById('modalCambioContrasenaPrimerIngreso');
  modal.style.display = 'none';
  window.cambioContrasenaCallback = null;
};

window.crearModalCambioContrasena();
