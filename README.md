# Carols50 · Web (Ventas y Clientes)

Versión web de los módulos **Ventas** (Carol's / Vendedoras) y **Clientes** (Carol's / Vendedoras)
de la app Android. Es un sitio 100% estático (HTML/CSS/JS, sin build ni frameworks) que se conecta
directamente al mismo proyecto Firebase que usa la app (`distribuidora-carols`), así que los datos
se comparten y sincronizan en tiempo real entre la app y la web.

**No usa Firebase Auth**: se abre directo, sin pantalla de login.

## Qué incluye

- **Ventas**: listado de pedidos (tabs Carol's / Vendedoras), con el mismo resaltado de urgencia
  por fecha de entrega (rojo/amarillo/verde) y eliminar pedido.
- **Detalle de pedido**: piezas del pedido, monto, monto + envío, anticipos, saldo pendiente,
  asignar comisión (pedidos de vendedoras), registrar/ver anticipos (con foto de comprobante) y
  exportar a Excel.
- **Clientes**: listado + buscador (tabs Carol's / Vendedoras), agregar cliente (con selects de
  departamento/municipio de El Salvador) y editar dirección.
- **Historial de pedidos de un cliente**, accesible desde la ficha del cliente.

## Fuera de alcance (a propósito)

No se incluyó nada de **captura de pedidos nuevos** (talla/tela/color) ni de **producción**
(corte, empaque) — esos flujos pertenecen a otros módulos de la app y quedaron fuera de este
pedido. Desde la web se puede consultar/gestionar clientes y dar seguimiento a pedidos ya creados
(montos, anticipos, comisión), pero no crear pedidos nuevos.

## ⚠️ Sobre las reglas de Firebase (ya funciona, pero léelo)

Se verificó en vivo contra la base de datos real: las reglas de **Realtime Database** y de
**Storage** del proyecto `distribuidora-carols` **ya permiten lectura y escritura sin
autenticación** — no fue necesario cambiar nada para que esta web funcione sin login.

Esto significa que, tal como está configurado hoy, cualquiera que tenga la URL de tu base de datos
(`distribuidora-carols-default-rtdb.firebaseio.com`) puede leer y escribir **toda** la base de
datos y el Storage, tenga o no el link de esta web — no es algo que introduzca este sitio, es el
estado actual de las reglas del proyecto. Si te interesa acotar eso más adelante (por ejemplo,
permitir sin login solo las rutas que usan estos dos módulos: `VENTAS GLOBALES`,
`TODOS LOS CLIENTES`, `PEDIDOS`, `COLABORADORES`, `FINANZAS`, y bloquear el resto), es un cambio
que se hace en la consola de Firebase cuando quieras — este sitio funciona igual antes y después.

## Configurar el SDK (una vez)

1. En la consola de Firebase, dentro del proyecto `distribuidora-carols`, ve a
   **Configuración del proyecto → Tus apps → Agregar app → Web (`</>`)**. Regístrala con cualquier
   nombre (ej. "Carols50 Web").
2. Copia el `appId` que te entregue (algo como `1:896145385150:web:xxxxxxxx`) y pégalo en
   [`js/firebase-config.js`](js/firebase-config.js), reemplazando
   `"1:896145385150:web:REEMPLAZAR_CON_TU_APP_ID_WEB"`. El resto de los valores (apiKey,
   databaseURL, storageBucket, etc.) ya están completos porque se tomaron del `google-services.json`
   del proyecto Android — son el mismo proyecto Firebase.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub (puede ser nuevo, o puedes subir solo esta carpeta a uno existente).
2. Copia el contenido de esta carpeta `webapp/` a la raíz de ese repositorio (o usa una rama/carpeta
   `docs/` — lo que prefieras, ajustando la configuración de Pages).
3. Sube los cambios:
   ```bash
   git init
   git add .
   git commit -m "Sitio web Carols50 - Ventas y Clientes"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```
4. En GitHub: **Settings → Pages → Source → Deploy from a branch**, elige la rama `main` y la
   carpeta `/ (root)`. Guarda.
5. En un par de minutos el sitio queda disponible en
   `https://TU-USUARIO.github.io/TU-REPO/`.

## Probar localmente antes de publicar

Como el sitio usa módulos ES (`<script type="module">`), no se puede abrir con doble clic
(`file://`) — el navegador bloquea los imports. Sirve la carpeta con cualquier servidor estático,
por ejemplo:

```bash
npx serve webapp
```

o

```bash
python -m http.server 5500 --directory webapp
```

y abre la URL que te indique en el navegador.

## Estructura de archivos

```
webapp/
  index.html              Página de inicio (enlaces a Ventas y Clientes)
  ventas.html / js/ventas.js
  clientes.html / js/clientes.js
  pedidos-cliente.html / js/pedidos-cliente.js     Historial de pedidos de un cliente
  pedido-detalle.html / js/pedido-detalle.js       Detalle de un pedido (monto, piezas, anticipos, comisión)
  js/firebase-config.js   Configuración del SDK de Firebase
  js/ubicaciones.js       Departamentos/municipios de El Salvador (igual que en la app Android)
  js/utils.js             Helpers compartidos
  css/styles.css
```

## Decisiones tomadas al portar (para que no te sorprendan)

- **Clientes de Vendedoras**: en la app Android, el listado "Clientes Vendedoras" lee de un nodo
  plano `CLIENTES` — pero se confirmó contra la base de datos real que ese nodo está **vacío**. Los
  clientes de vendedoras reales viven anidados en `TODOS LOS CLIENTES/VENDEDORAS/{telVendedora}/{telCliente}`
  (que es donde sí escribe la pantalla de agregar cliente de la app, y coincide con más de 20
  clientes reales verificados). La web lee y escribe en esa ruta anidada (uniendo todas las
  vendedoras en una sola lista) para mostrar los datos reales; si alguna vez migran esos datos al
  nodo plano `CLIENTES`, avísame para actualizar la ruta.
- **Editar dirección de cliente**: existía en el código Android pero no estaba conectada a ningún
  botón, y solo funcionaba para clientes Carol's (ruta fija). En la web se agregó el botón "Editar
  dirección" en ambas pestañas, escribiendo en la ruta correcta según el tipo de cliente.
- **Asignar comisión**: se simplificó la condición de cuándo mostrar el botón (visible si el pedido
  es de una vendedora y aún no tiene comisión asignada), en vez de replicar una lógica de
  visibilidad un poco inconsistente que tenía el código original.
