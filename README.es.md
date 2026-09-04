# 🧭 Intelligent Workspace

> **Transforma Google Chrome en una estación de trabajo inteligente, hiper-productiva y autónoma.**

![Version](https://img.shields.io/badge/Versión-1.0.0-blue.svg)
![Status](https://img.shields.io/badge/Estado-Producción-success.svg)
![License](https://img.shields.io/badge/Licencia-Propietaria-red.svg)

**Intelligent Workspace** es una estación de trabajo de productividad integrada directamente en el panel lateral de Google Chrome. Unifica la gestión inteligente de pestañas y ventanas, notas de investigación, seguimiento de sesiones de concentración (Pomodoro) y navegación por teclado en un único entorno fluido y libre de distracciones.

---

## ✨ Características Principales

### 🤖 Asistente y Agente IA (Integración con Google Gemini)
- **Modo Agente Autónomo:** Pídele a la IA en lenguaje natural que organice tu navegador (ej. *"Cierra todas las pestañas de deportes y crea un grupo rojo llamado Trabajo con las pestañas de GitHub y Jira"*).
- **Chat y Resúmenes:** Resume artículos largos al instante, extrae información clave y guarda el historial de tus conversaciones.
- **Consultas Programadas:** Programa a la IA para que ejecute tareas (ej. resúmenes de noticias) en días y horas específicas.

### 📁 Gestión Inteligente de Pestañas
- **Agrupación Automática:** Agrupa pestañas por dominio, subdominio, direcciones IP o reglas personalizadas (Regex).
- **Auto-Colapso Inteligente:** Temporizadores configurables que colapsan automáticamente los grupos inactivos para limpiar tu espacio visual.
- **Workspaces y Backups:** Guarda grupos enteros de pestañas, libéralos de la memoria RAM y restáuralos con un solo clic cuando los necesites.

### 🍅 Productividad y Deep Work
- **Panel Pomodoro Avanzado:** Temporizador flotante con gestión por proyectos.
- **Analíticas y Dashboard:** Visualiza tu eficiencia, interrupciones, mapas de calor (estilo GitHub) y rachas de trabajo directamente en un panel interactivo.

### ⌨️ Navegación por Teclado y Snippets
- **Sistema de Hints:** Navega, haz clic, copia enlaces y desplázate por cualquier página web usando exclusivamente el teclado.
- **Snippets Dinámicos:** Crea atajos de texto con formato enriquecido y variables personalizadas (`$1`, `$2`) que se expanden automáticamente en cualquier campo de texto.

### 🛠️ Utilidades de Productividad y Espacio de Trabajo
- **Pantalla Dividida (Split Screen):** Visualiza dos pestañas en paralelo en la misma ventana del navegador.
- **Modo Lectura y Temas:** Modo oscuro, sepia, papel y creador de temas personalizados con colores inyectados en la interfaz del navegador.
- **Captura para Investigación:** Herramienta de capturas de pantalla completa y por áreas con galería local, gestor de marcadores y notas rápidas.

---

## 🚀 Instalación y Compilación (Modo Desarrollador)

Para compilar e instalar la extensión localmente desde el código fuente:

### Requisitos previos
- [Node.js](https://nodejs.org/) (versión 18 o superior recomendada)
- [pnpm](https://pnpm.io/) (instalable con `npm install -g pnpm` o mediante Corepack)

### Instrucciones de compilación
```bash
# 1. Clonar el repositorio
git clone https://github.com/luisrb85/intelligent-tab-group.git
cd intelligent-tab-group

# 2. Instalar las dependencias del proyecto
pnpm install

# 3. Compilar la extensión para producción
pnpm run build
```

*(Para desarrollo con recarga en vivo en caliente, ejecuta `pnpm run dev`).*

### Cargar la extensión en Google Chrome
1. Abre Google Chrome y navega a `chrome://extensions/`.
2. Activa el **"Modo de desarrollador"** (interruptor en la esquina superior derecha).
3. Haz clic en el botón **"Cargar descomprimida"**.
4. Selecciona la carpeta **`dist/`** generada tras el paso de compilación (NO la carpeta raíz).
5. Fija **Intelligent Workspace** en la barra de herramientas para un acceso ágil.

---

## ⚙️ Configuración Inicial

Para sacarle el máximo partido a las funciones de Inteligencia Artificial:
1. Abre el panel lateral de la extensión haciendo clic en el icono de **Intelligent Workspace**.
2. Ve a la pestaña del **Asistente IA**.
3. Haz clic en **"Añadir Clave API"**.
4. Pega tu API Key gratuita de [Google AI Studio](https://aistudio.google.com/app/apikey). *(Tu clave se guarda exclusivamente de forma local en tu dispositivo por seguridad).*

---

## 🤝 Contribuciones y Reporte de Errores

¡Agradecemos inmensamente a la comunidad técnica por reportar bugs y proponer mejoras! 

Si deseas contribuir con código (Pull Requests), por favor lee atentamente nuestro archivo `CONTRIBUTING.md`. Ten en cuenta que, para poder integrar tus mejoras en la versión oficial de la extensión, **al enviar un Pull Request aceptas ceder los derechos de propiedad intelectual de dicha contribución** a los creadores originales del proyecto.

¿Encontraste un error? Por favor, abre un [Issue](https://github.com/luisrb85/intelligent-tab-group/issues) detallando el problema.

---

## 📜 Licencia y Propiedad Intelectual

**Copyright (c) 2026 GENKI Organización / Luis Reoyo. Todos los derechos reservados.**

El código fuente de "Intelligent Workspace" se publica en GitHub con el único fin de permitir auditorías de seguridad, fomentar el aprendizaje y facilitar la colaboración de la comunidad mediante *Pull Requests*.

**QUEDA ESTRICTAMENTE PROHIBIDO:**
1. Copiar, clonar, bifurcar (*fork* para uso externo) o reproducir este código para crear un producto derivado.
2. Compilar, empaquetar y publicar este código (en su totalidad o partes del mismo) en la Chrome Web Store, Edge Add-ons, Firefox Add-ons o cualquier otra plataforma de distribución de software.
3. Utilizar este código o sus componentes con fines comerciales.

**PERMISOS CONCEDIDOS:**
- Tienes permiso para descargar y compilar este código en tu máquina local **exclusivamente para uso personal y privado**.
- Puedes crear un *Fork* en GitHub única y exclusivamente con el fin de proponer mejoras o solucionar errores mediante un *Pull Request* hacia este repositorio original.

---

## 🎖️ Créditos y Agradecimientos

- **Desarrollo y Arquitectura:** Luis Reoyo (Luisrb85).
- **Diseño UX/UI y Testing QA:** Flor Chávez.

*Un agradecimiento especial a Flor Chávez por su incansable dedicación en las pruebas de calidad, diseño del logotipo y la creación de una experiencia de usuario estéticamente gratificante e intuitiva. Esta extensión no existiría con su nivel de calidad actual sin su participación.*

---
*Navegación más inteligente, sin esfuerzo.*
