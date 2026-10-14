/**
 * CLI del importador del Set de Pruebas de la DGII (ECF-9).
 *
 *   npm run set-pruebas -- <archivo.xlsx> [--out <directorio>] [--no-dry-run]
 *
 * Por defecto es DRY-RUN: genera y valida los XML, muestra el reporte por
 * fila y no firma. Con --out deja los XML sin firmar y reporte.json.
 * Con --no-dry-run (exige --out) firma TODOS los XML (solo si todas las filas
 * están OK) con el certificado configurado por DGII_CERT_P12_BASE64 +
 * DGII_CERT_PASSPHRASE (variables de entorno del proceso; este CLI NO lee
 * .env). Sin ellas firma con un certificado de desarrollo.
 *
 * NUNCA transmite nada a la DGII/CerteCF (no hay código de envío aquí).
 */
import { ConfigService } from '@nestjs/config';
import { DgiiCertificateService } from '../dgii/dgii-certificate.service';
import { EcfSigningService } from '../ecf/services/ecf-signing.service';
import { EcfXmlService } from '../ecf/services/ecf-xml.service';
import { XsdValidatorService } from '../validation/xsd-validator.service';
import { SetPruebasService } from './set-pruebas.service';
import { XsdRealValidator } from './xsd-real.validator';

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const archivo = args.find((a) => !a.startsWith('--'));
  const iOut = args.indexOf('--out');
  const out = iOut >= 0 ? args[iOut + 1] : undefined;
  const dryRun = !args.includes('--no-dry-run');

  if (!archivo || (iOut >= 0 && !out)) {
    console.error('Uso: npm run set-pruebas -- <archivo.xlsx> [--out <directorio>] [--no-dry-run]');
    return 2;
  }
  if (!dryRun && !out) {
    console.error('--no-dry-run requiere --out <directorio> (dónde dejar los XML firmados)');
    return 2;
  }

  const signing = dryRun
    ? undefined
    : new EcfSigningService(new DgiiCertificateService(new ConfigService()));
  const servicio = new SetPruebasService(
    new EcfXmlService(),
    new XsdValidatorService(),
    new XsdRealValidator(),
    signing,
  );

  const reporte = await servicio.importar(archivo, { dryRun, directorioSalida: out });

  console.log(`\nSet de Pruebas — ${dryRun ? 'DRY-RUN (no firma, no transmite)' : 'FIRMA LOCAL (no transmite)'}`);
  for (const f of reporte.filas) {
    const id = `${f.hoja} fila ${f.fila}${f.caso ? ` [${f.caso}]` : ''}${f.encf ? ` ${f.encf}` : ''}`;
    console.log(`${f.estado === 'OK' ? 'OK   ' : 'ERROR'} ${id}`);
    f.errores.forEach((e) => console.log(`       - ${e}`));
    f.advertencias.forEach((w) => console.log(`       ! ${w}`));
  }
  reporte.hojasOmitidas.forEach((h) => console.log(`OMITIDA hoja "${h.nombre}": ${h.motivo}`));
  reporte.mensajes.forEach((m) => console.log(m));
  console.log(`\nTotal ${reporte.totalFilas} · OK ${reporte.ok} · con error ${reporte.conErrores} · firmado: ${reporte.firmado ? 'sí' : 'no'} · transmitido: no`);
  return reporte.conErrores > 0 || reporte.totalFilas === 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(2);
  },
);
