// Modal de Cambio de Contraseña para Primer Ingreso
// Se carga dinámicamente cuando se detecta primer ingreso

// Variables globales
window.cambioContrasenaCallback = null;
window.modalCreado = false;

// Función para crear el modal
window.crearModalCambioContrasena = function() {
  if (window.modalCreado) return;
  
  const modalHTML = `
    <div id="modalCambioContrasenaPrimerIngreso" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;align-items:center;justify-content:center;">
      <div style="background:white;padding:30px;border-radius:12px;max-width:400px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
        <h2 style="margin:0 0 20px 0;color:#C59B34;text-align:center;">🔑 Cambio de Contraseña</h2>
        <p style="margin:0 0 20px 0;color:#666;text-align:center;">
          Es tu primer ingreso. Por seguridad, debes cambiar tu contraseña para continuar.
        </p>
        
        <div style="margin-bottom:15px;">
          <label style="display:block;margin-bottom:5px;color:#333;font-weight:600;">Nueva Contraseña</label>
          <input type="password" id="inputNuevaContrasena" placeholder="Mínimo 6 caracteres" 
                 style="width:100%;padding:12px;border:1px solid #ddd;border-radius:6px;font-size:16px;box-sizing:border-box;">
        </div>
        
        <div style="margin-bottom:20px;">
          <label style="display:block;margin-bottom:5px;color:#333;font-weight:600;">Confirmar Contraseña</label>
          <input type="password" id="inputConfirmarContrasena" placeholder="Repite la nueva contraseña" 
                 style="width:100%;padding:12px;border:1px solid #ddd;border-radius:6px;font-size:16px;box-sizing:border-box;">
        </div>
        
        <div id="errorContrasena" style="margin-bottom:15px;color:#d32f2f;font-size:14px;display:none;"></div>
        
        <div style="display:flex;gap:10px;">
          <button id="btnCancelarCambio" 
                  style="flex:1;padding:12px;border:1px solid #ddd;background:#f5f5f5;border-radius:6px;cursor:pointer;font-size:16px;">
            Cancelar
          </button>
          <button id="btnConfirmarCambio" 
                  style="flex:1;padding:12px;border:none;background:#C59B34;color:white;border-radius:6px;cursor:pointer;font-size:16px;font-weight:600;">
            Cambiar Contraseña
          </button>
        </div>
      </div>
    </div>
  `;

  // Insertar el modal en el body
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

// Función para configurar event listeners
function configurarEventListeners() {
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

// Función para mostrar el modal
window.mostrarModalCambioContrasena = function(callback) {
  // Crear modal si no existe
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

// Función para ocultar el modal
window.ocultarModalCambioContrasena = function() {
  const modal = document.getElementById('modalCambioContrasenaPrimerIngreso');
  modal.style.display = 'none';
  window.cambioContrasenaCallback = null;
};

console.log('✅ Script de cambio de contraseña cargado');
