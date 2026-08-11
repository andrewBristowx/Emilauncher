const { MicrosoftAuthenticator } = require('@xmcl/user');

class MinecraftAuthError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'MinecraftAuthError';
    this.code = code;
    this.details = details;
  }
}

async function readResponseBody(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { raw: text }; }
}

function authErrorFrom(error) {
  const raw = `${error?.message || ''}\n${error?.stack || ''}\n${JSON.stringify(error?.response || error?.cause || {})}`;
  if (/Invalid app registration|AppRegInfo|403/i.test(raw)) {
    return new MinecraftAuthError(
      'minecraft_app_registration_required',
      'Microsoft aceptó la cuenta, pero Minecraft Services rechazó este Client ID. La aplicación de EmiLauncher necesita un Client ID autorizado/registrado para Minecraft Services.',
      raw.slice(0, 4000)
    );
  }
  if (/2148916233|child account|family/i.test(raw)) return new MinecraftAuthError('xbox_child_account', 'La cuenta Xbox necesita completar la configuración familiar/privacidad antes de poder iniciar Minecraft.', raw.slice(0, 4000));
  if (/2148916238|region/i.test(raw)) return new MinecraftAuthError('xbox_region_required', 'La cuenta Xbox necesita tener una región configurada.', raw.slice(0, 4000));
  return new MinecraftAuthError('minecraft_auth_failed', error?.message || 'Falló la autenticación de Xbox/Minecraft.', raw.slice(0, 4000));
}

async function fetchMinecraftProfile(accessToken) {
  const response = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'EmiLauncher/0.5.0'
    }
  });
  const body = await readResponseBody(response);
  if (response.status === 404) throw new MinecraftAuthError('minecraft_profile_missing', 'La cuenta Microsoft inició sesión, pero no tiene un perfil de Minecraft: Java Edition disponible.');
  if (!response.ok) {
    const raw = JSON.stringify(body);
    if (response.status === 403 && /Invalid app registration|AppRegInfo/i.test(raw)) {
      throw new MinecraftAuthError('minecraft_app_registration_required', 'Microsoft aceptó la cuenta, pero Minecraft Services rechazó este Client ID. La aplicación de EmiLauncher necesita un Client ID autorizado/registrado para Minecraft Services.', raw);
    }
    throw new MinecraftAuthError('minecraft_profile_failed', `Minecraft Services devolvió HTTP ${response.status}.`, raw);
  }
  if (!body?.id || !body?.name) throw new MinecraftAuthError('minecraft_profile_invalid', 'Minecraft Services no devolvió un perfil de jugador válido.');
  return body;
}

async function exchangeMicrosoftForMinecraft(msAccessToken) {
  if (!msAccessToken) throw new MinecraftAuthError('microsoft_token_missing', 'Falta el token de Microsoft.');
  try {
    const authenticator = new MicrosoftAuthenticator();
    const xbox = await authenticator.acquireXBoxToken(msAccessToken);
    const xsts = xbox?.minecraftXstsResponse;
    const uhs = xsts?.DisplayClaims?.xui?.[0]?.uhs;
    const token = xsts?.Token;
    if (!uhs || !token) throw new Error('Xbox/XSTS no devolvió el token de Minecraft esperado.');
    const minecraft = await authenticator.loginMinecraftWithXBox(uhs, token);
    const accessToken = minecraft?.access_token;
    if (!accessToken) throw new Error('Minecraft Services no devolvió access_token.');
    const profile = await fetchMinecraftProfile(accessToken);
    return { accessToken, expiresIn: Number(minecraft?.expires_in || 0), profile };
  } catch (error) {
    if (error instanceof MinecraftAuthError) throw error;
    throw authErrorFrom(error);
  }
}

module.exports = { MinecraftAuthError, exchangeMicrosoftForMinecraft, fetchMinecraftProfile };
