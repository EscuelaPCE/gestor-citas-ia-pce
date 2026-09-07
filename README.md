# Gestor de citas IA - Grupo Escuela PCE

Primera versión de una web interna para agendar reuniones individuales sobre el uso de herramientas de IA.

## Qué incluye

- Calendario semanal de lunes a viernes.
- Periodo de reserva limitado del lunes 14 de septiembre de 2026 al viernes 2 de octubre de 2026.
- Tarde del 17 de septiembre de 2026 bloqueada por defecto.
- Citas de 1 hora por defecto, con opción administrativa de 45 o 30 minutos.
- Datos de reserva: nombre, puesto, correo electrónico y comentario opcional.
- Bloqueo automático del turno contrario:
  - si se agenda una cita por la mañana, se cierra la tarde de ese día;
  - si se agenda una cita por la tarde, se cierra la mañana.
- Gestión personal de la cita usando el mismo nombre y correo de la reserva.
- Panel de administración para Miguel con acceso por contraseña.
- Configuración editable de la intención de la cita para reutilizar el sistema después como tutorías, consultas u otros encuentros de IA.
- Bloqueo manual de turnos completos.
- Exportación de citas y configuración en JSON.

## Cómo probarlo

Abre `index.html` en el navegador.

Los datos se guardan de momento en `localStorage`, por lo que permanecen en el mismo navegador. Para una versión en producción conviene añadir backend o una base de datos.

## Nota de seguridad

El panel de administración está preparado como prototipo funcional en una web estática. La contraseña está en el código JavaScript, así que no debe considerarse una protección real si la web se publica públicamente. Para producción hay que mover la autenticación y la gestión de citas a un servidor o servicio con permisos reales.

## Siguiente evolución recomendada

- Persistencia centralizada para que todos los trabajadores vean la misma disponibilidad.
- Envío de confirmaciones por correo.
- Panel de administración con autenticación real.
- Configuración real de festivos, vacaciones y excepciones.

## Envío a Google Forms

La integración sencilla queda preparada en `app.js`, pero está desactivada hasta que se rellenen los datos reales del formulario.

Pasos:

1. Crea un Google Form con estos campos, preferiblemente en este orden:
   - Nombre y apellidos
   - Puesto
   - Correo electrónico
   - Fecha
   - Hora
   - Tipo de cita
   - Comentario opcional
2. Vincula el formulario a una Google Sheet desde la pestaña de respuestas.
3. Activa las notificaciones de nuevas respuestas en Google Forms o en la hoja de cálculo.
4. Abre el formulario publicado, inspecciona el HTML o usa una respuesta pre-rellenada para localizar:
   - la URL terminada en `/formResponse`;
   - los nombres de campo tipo `entry.123456789`.
5. En `app.js`, dentro de `DEFAULT_CONFIG.googleForm`, cambia:
   - `enabled` a `true`;
   - `actionUrl` por la URL `/formResponse`;
   - cada campo por su `entry.xxxxx` correspondiente.

Ejemplo de configuración:

```js
googleForm: {
  enabled: true,
  actionUrl: "https://docs.google.com/forms/d/e/FORM_ID/formResponse",
  fields: {
    name: "entry.111111111",
    role: "entry.222222222",
    email: "entry.333333333",
    date: "entry.444444444",
    time: "entry.555555555",
    purpose: "entry.666666666",
    notes: "entry.777777777",
  },
},
```

Con esta opción, la web mantiene su calendario y su lógica de disponibilidad, y Google Forms sirve como registro externo con aviso por email.
