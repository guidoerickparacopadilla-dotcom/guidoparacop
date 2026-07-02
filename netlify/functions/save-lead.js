exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Method not allowed'
      })
    };
  }

  try {
    const webhookUrl = process.env.LEADS_WEBHOOK_URL;

    if (!webhookUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'LEADS_WEBHOOK_URL no está configurada'
        })
      };
    }

    const data = JSON.parse(event.body || '{}');

    const payload = {
      nombre: data.nombre || '',
      whatsapp: data.whatsapp || '',
      ciudad: data.ciudad || '',
      tipoNegocio: data.tipoNegocio || '',
      nicho: data.nicho || '',
      necesidad: data.necesidad || '',
      urgencia: data.urgencia || '',
      leadScore: data.leadScore || '',
      resumenConversacion: data.resumenConversacion || '',
      estado: data.estado || 'Nuevo',
      proximaAccion: data.proximaAccion || '',
      fuente: data.fuente || 'Web / Simulador IA'
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: 'Lead enviado al CRM',
        googleResponse: text
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }
};
