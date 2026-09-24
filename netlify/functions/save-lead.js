exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };

  const respond = (statusCode, body) => ({
    statusCode,
    headers,
    body: JSON.stringify(body)
  });

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, {
      ok: false,
      error: 'Method not allowed'
    });
  }

  try {
    const webhookUrl =
      process.env.LEADS_WEBHOOK_URL;

    if (!webhookUrl) {
      return respond(500, {
        ok: false,
        error:
          'LEADS_WEBHOOK_URL no está configurada en Netlify.'
      });
    }

    let data = {};

    try {
      data =
        JSON.parse(event.body || '{}');
    } catch {
      return respond(400, {
        ok: false,
        error:
          'El cuerpo recibido no es JSON válido.'
      });
    }

    const clean = (value, max = 800) => {
      if (
        value === null ||
        value === undefined
      ) {
        return '';
      }

      return String(value)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
    };

    const normalizePhone = (value) => {
      const raw = clean(value, 40);

      if (!raw) return '';

      const digits =
        raw.replace(/\D/g, '');

      if (
        digits.length === 10 &&
        digits.startsWith('3')
      ) {
        return `+57${digits}`;
      }

      if (
        digits.length === 12 &&
        digits.startsWith('57')
      ) {
        return `+${digits}`;
      }

      return raw;
    };

    const fecha =
      new Date().toLocaleString(
        'es-CO',
        {
          timeZone: 'America/Bogota',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }
      );

    const payload = {
      fecha,

      nombre:
        clean(data.nombre, 100),

      whatsapp:
        normalizePhone(
          data.whatsapp
        ),

      ciudad:
        clean(data.ciudad, 100),

      tipoNegocio:
        clean(
          data.tipoNegocio,
          150
        ),

      nicho:
        clean(data.nicho, 100),

      necesidad:
        clean(
          data.necesidad,
          400
        ),

      urgencia:
        clean(
          data.urgencia,
          30
        ),

      leadScore:
        Number.isFinite(
          Number(data.leadScore)
        )
          ? Math.min(
              100,
              Math.max(
                0,
                Number(data.leadScore)
              )
            )
          : '',

      resumenConversacion:
        clean(
          data.resumenConversacion,
          1200
        ),

      estado:
        clean(
          data.estado,
          100
        ) ||
        'Lead en conversación',

      proximaAccion:
        clean(
          data.proximaAccion,
          300
        ) ||
        'Contactar por WhatsApp',

      fuente:
        clean(
          data.fuente,
          100
        ) ||
        'Web / Simulador IA'
    };

    // =====================================
    // VALIDACIÓN MÍNIMA
    // =====================================

    const missingFields = [];

    if (!payload.nombre) {
      missingFields.push('nombre');
    }

    if (!payload.whatsapp) {
      missingFields.push('whatsapp');
    }

    if (!payload.ciudad) {
      missingFields.push('ciudad');
    }

    if (!payload.tipoNegocio) {
      missingFields.push(
        'tipoNegocio'
      );
    }

    if (!payload.necesidad) {
      missingFields.push(
        'necesidad'
      );
    }

    if (missingFields.length) {
      return respond(400, {
        ok: false,
        error:
          'Lead incompleto. No se envió al CRM.',
        missingFields
      });
    }

    // =====================================
    // ENVÍO A GOOGLE APPS SCRIPT
    // =====================================

    const response =
      await fetch(
        webhookUrl,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(payload),

          redirect: 'follow'
        }
      );

    const responseText =
      await response.text();

    // =====================================
    // ERROR HTTP REAL
    // =====================================

    if (!response.ok) {
      console.error(
        'CRM_WEBHOOK_HTTP_ERROR',
        {
          status:
            response.status,

          response:
            responseText
        }
      );

      return respond(502, {
        ok: false,
        error:
          `El CRM respondió HTTP ${response.status}.`,
        googleResponse:
          responseText.slice(
            0,
            500
          )
      });
    }

    // =====================================
    // SI GOOGLE DEVUELVE JSON,
    // REVISAMOS SI REPORTÓ ERROR
    // =====================================

    let parsedResponse = null;

    try {
      parsedResponse =
        JSON.parse(responseText);
    } catch {
      parsedResponse = null;
    }

    if (
      parsedResponse &&
      (
        parsedResponse.ok === false ||
        parsedResponse.success === false ||
        parsedResponse.error
      )
    ) {
      console.error(
        'CRM_WEBHOOK_REPORTED_ERROR',
        parsedResponse
      );

      return respond(502, {
        ok: false,
        error:
          parsedResponse.error ||
          'Google Apps Script reportó un error.',
        googleResponse:
          parsedResponse
      });
    }

    // =====================================
    // ÉXITO CONFIRMADO
    // =====================================

    return respond(200, {
      ok: true,
      message:
        'Lead enviado correctamente al CRM.',
      payload,
      googleResponse:
        parsedResponse ||
        responseText.slice(
          0,
          500
        )
    });

  } catch (error) {
    console.error(
      'SAVE_LEAD_FATAL_ERROR',
      error
    );

    return respond(500, {
      ok: false,
      error:
        error?.message ||
        'Error interno guardando el lead.'
    });
  }
};
