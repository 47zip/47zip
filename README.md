# Folio — tienda de recursos digitales

Aplicación móvil y adaptable para vender PDFs, DOCX, ZIP y RAR con biblioteca privada por cliente. La marca Folio y las tarjetas de muestra son provisionales. Si el catálogo aún no está conectado, la portada muestra muestras que no se pueden comprar.

## Incluye

- Catálogo publicado desde Supabase, filtros y carrito.
- Supabase Auth, registro, inicio de sesión, recuperación de contraseña y biblioteca de pedidos por cuenta.
- Panel /admin separado de /cuenta; el servidor valida rol admin y MFA (AAL2). Las métricas globales se calculan en SQL con esos mismos controles.
- /admin/productos para crear y publicar productos mediante carga directa a un Vercel Blob store privado.
- Checkout de servidor para PayPal y NOWPayments. El backend recalcula precios, valida las notificaciones del proveedor y no entrega el archivo por el solo regreso del comprador al sitio.
- Por cada compra confirmada se genera un ZIP AES-256 con contraseña aleatoria propia del pedido. La clave se cifra en base de datos y solo se muestra al titular autenticado. Cada pedido permite hasta cinco descargas.
- Cada PDF recibe una marca de pedido en sus páginas. Cada DOCX recibe un sello individual de licencia. El ZIP incluye además LEEME-LICENCIA.txt. ZIP/RAR originales se conservan dentro del nuevo paquete.

La personalización disuade la reventa, pero no puede impedir que el comprador comparta el archivo junto con su contraseña. La marca identifica un pedido y se puede relacionar internamente con la cuenta que lo compró.

## Preparación

1. Crea un proyecto Supabase y aplica supabase/migrations/20261005_shop.sql en un proyecto nuevo.
2. En Supabase Auth, habilita confirmación de correo, TOTP y URL permitidas para desarrollo y tu dominio Vercel, incluyendo /auth/callback.
3. Crea y confirma tu cuenta. Asígnale rol administrador en el SQL Editor:

   ~~~sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'TU_CORREO';
   ~~~

4. Crea un Vercel Blob store con acceso Private.
5. Copia .env.example a .env.local. Completa las variables reales; en producción agrégalas a Vercel. Para DOWNLOAD_SECRET_KEY, genera 32 bytes aleatorios en PowerShell:

   ~~~powershell
   $secretBytes = New-Object byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($secretBytes)
   [Convert]::ToBase64String($secretBytes)
   ~~~

   Guarda esa clave fuera de Git y consérvala: perderla impide recuperar contraseñas ya generadas. Ningún secreto va al navegador ni lleva prefijo NEXT_PUBLIC_.
6. Empieza PayPal en Sandbox. Configura el webhook /api/payments/paypal/webhook para PAYMENT.CAPTURE.COMPLETED y PAYMENT.CAPTURE.REFUNDED; guarda su ID en PAYPAL_WEBHOOK_ID.
7. NOWPayments permite usar MXN como moneda base, pero revisa sus términos, leyes aplicables y aprobación del comercio antes de activarlo. Configura la IPN /api/payments/nowpayments y NOWPAYMENTS_IPN_SECRET.
8. Define NEXT_PUBLIC_SITE_URL como el origen exacto del sitio. Instala dependencias con pnpm install y usa pnpm dev para desarrollo.
9. Los archivos de admin se suben directamente a Blob. Vercel documenta que las cargas del navegador evitan el límite de cuerpo de Functions de 4.5 MB; para recibir el callback de carga, prueba desde un despliegue Preview/Production o configura un túnel público en local.
10. Entra a /admin/activar-mfa y enrola TOTP. Agrega productos desde /admin/productos; sube originales sin contraseña. La venta se habilita cuando termina la carga privada.

## Política comercial y temas que faltan

- La tienda indica sin reembolso voluntario por cambio de opinión tras la entrega, y solicita aceptar la política antes de ir al pago. Esto no elimina derechos que resulten aplicables. Los reembolsos, contracargos o reversiones que procese el proveedor siguen registrados para suspender descargas y cuadrar ventas.
- /politica-de-compras es un borrador: completa nombre legal, RFC, domicilio, correo real de soporte y mecanismos de reclamación. Revisa la política con asesoría para tu operación en México antes de vender; también faltan el Aviso de Privacidad y términos completos.
- Define impuestos/CFDI, países donde venderás, límites de descarga, soporte para archivos dañados y costos/plazos del proveedor de pagos.
- El límite provisional es 25 MB por pedido (MAX_PACKAGE_SOURCE_BYTES). Vercel Blob recibe el original sin pasarlo por el límite del cuerpo de la Function; la generación personalizada aún procesa datos en memoria. Para archivos mayores, mueve ese trabajo a un worker.
- Si un ZIP/RAR original ya está cifrado, el sistema no puede quitar su contraseña interior. El comprador necesitará tanto esa clave como la clave personal del ZIP exterior.
- PDF cifrados/dañados o DOCX no estándar pueden no admitir el sello. Si no se puede preparar el paquete, el pedido queda señalado para atención y reintento.

No se ha conectado ninguna cuenta comercial ni desplegado el sitio. Para habilitar compras debes crear los servicios, configurar sus credenciales en Vercel, completar los datos del proveedor y activar el dominio.
