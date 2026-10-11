import { EcfXmlService } from './ecf-xml.service';

/**
 * Totales por tasa, vencimiento de secuencia, crédito y notas de crédito. Los XML de
 * estos mismos escenarios se validaron contra los XSD oficiales de la DGII (lxml) y
 * contra TesteCF; aquí se fijan los valores clave para que no se regresen.
 */
const L = (descripcion: string, sub: number, ind: number) => {
  const rate = ({ 1: 0.18, 2: 0.16, 3: 0, 4: 0 } as Record<number, number>)[ind];
  return {
    descripcion,
    cantidad: 1,
    precioUnitario: sub,
    indicadorFacturacion: ind,
    indicadorBienoServicio: 2,
    subtotal: sub,
    itbis: Math.round(sub * rate * 100) / 100,
    descuentoLinea: 0,
  };
};

const mk = (tipo: string, lineas: ReturnType<typeof L>[], extra: Record<string, unknown> = {}) =>
  ({
    tipoEcf: tipo,
    encf: `E${tipo.match(/\d+/)![0]}0000000010`,
    fechaEmision: new Date('2026-10-11T12:00:00Z'),
    rncEmisor: '132943058',
    nombreEmisor: 'STP',
    direccionEmisor: 'Calle 1',
    tipoPago: 1,
    tipoIngresos: '01',
    rncComprador: '132943058',
    nombreComprador: 'Cliente',
    montoTotal: lineas.reduce((s, l) => s + l.subtotal + l.itbis, 0),
    montoITBIS: lineas.reduce((s, l) => s + l.itbis, 0),
    montoPropinaLegal: 0,
    montoItbisRetenido: 0,
    montoRentaRetenido: 0,
    aplicaPropinaLegal: false,
    lineas,
    ...extra,
  }) as never;

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>(.*?)</${name}>`))?.[1];

describe('EcfXmlService — totales y campos nuevos', () => {
  const svc = new EcfXmlService();
  const venc = { fechaVencimientoSecuencia: '2027-12-31' };

  it('mezcla de líneas exentas y gravadas: el gravado y el ITBIS salen solo de las gravadas', () => {
    const xml = svc.generateXml(
      mk('e-CF_31_v_1_0', [L('Pisos', 60000, 4), L('Pintura', 40000, 4), L('Dirección Técnica', 10000, 1), L('Imprevistos', 5000, 4)]),
      1,
      venc,
    );
    expect(tag(xml, 'MontoGravadoTotal')).toBe('10000.00');
    expect(tag(xml, 'MontoGravadoI1')).toBe('10000.00');
    expect(tag(xml, 'MontoExento')).toBe('105000.00');
    expect(tag(xml, 'TotalITBIS')).toBe('1800.00');
    expect(tag(xml, 'TotalITBIS1')).toBe('1800.00');
    expect(tag(xml, 'MontoTotal')).toBe('116800.00');
  });

  it('todo exento: sin bloques de ITBIS', () => {
    const xml = svc.generateXml(mk('e-CF_31_v_1_0', [L('Servicio', 1000, 4)]), 1, venc);
    expect(tag(xml, 'MontoExento')).toBe('1000.00');
    expect(xml).not.toContain('MontoGravado');
    expect(xml).not.toContain('TotalITBIS');
  });

  it('varias tasas: cada una en su campo', () => {
    const xml = svc.generateXml(
      mk('e-CF_31_v_1_0', [L('A', 1000, 1), L('B', 500, 2), L('C', 300, 3), L('D', 200, 4)]),
      1,
      venc,
    );
    expect(tag(xml, 'MontoGravadoI1')).toBe('1000.00');
    expect(tag(xml, 'MontoGravadoI2')).toBe('500.00');
    expect(tag(xml, 'MontoGravadoI3')).toBe('300.00');
    expect(tag(xml, 'MontoExento')).toBe('200.00');
    expect(tag(xml, 'TotalITBIS')).toBe('260.00');
    expect(tag(xml, 'TotalITBIS2')).toBe('80.00');
  });

  it('FechaVencimientoSecuencia va en el e-CF 31 y no en el 32', () => {
    expect(tag(svc.generateXml(mk('e-CF_31_v_1_0', [L('S', 100, 1)]), 1, venc), 'FechaVencimientoSecuencia')).toBe('31-12-2027');
    expect(svc.generateXml(mk('e-CF_32_v_1_0', [L('S', 100, 1)], { rncComprador: undefined }), 1, {})).not.toContain(
      'FechaVencimientoSecuencia',
    );
  });

  it('falla con un mensaje claro si falta el vencimiento donde se exige', () => {
    expect(() => svc.generateXml(mk('e-CF_31_v_1_0', [L('S', 100, 1)]), 1, {})).toThrow(/vencimiento de la secuencia/);
  });

  it('venta a crédito: fecha límite y término de pago, en el orden del XSD', () => {
    const xml = svc.generateXml(
      mk('e-CF_31_v_1_0', [L('S', 100, 1)], { tipoPago: 2, terminoPago: '30 dias', fechaLimitePago: '2026-11-10' }),
      1,
      venc,
    );
    expect(tag(xml, 'FechaLimitePago')).toBe('10-11-2026');
    expect(xml.indexOf('<FechaLimitePago>')).toBeLessThan(xml.indexOf('<TerminoPago>'));
  });

  it('nota de crédito: indicador, referencia y sin vencimiento de secuencia', () => {
    const dentro = svc.generateXml(
      mk('e-CF_34_v_1_0', [L('Anula', 1000, 1)], {
        ncfModificado: 'E310000000005',
        fechaNcfModificado: '2026-10-10',
        codigoModificacion: 1,
        razonModificacion: 'Anula la factura',
      }),
      1,
      {},
    );
    expect(tag(dentro, 'IndicadorNotaCredito')).toBe('0');
    expect(tag(dentro, 'NCFModificado')).toBe('E310000000005');
    expect(tag(dentro, 'FechaNCFModificado')).toBe('10-10-2026');
    expect(tag(dentro, 'CodigoModificacion')).toBe('1');
    expect(tag(dentro, 'RazonModificacion')).toBe('Anula la factura');
    expect(dentro).not.toContain('FechaVencimientoSecuencia');
    // la referencia va después de los ítems y antes de la fecha de firma
    expect(dentro.indexOf('</DetallesItems>')).toBeLessThan(dentro.indexOf('<InformacionReferencia>'));
    expect(dentro.indexOf('</InformacionReferencia>')).toBeLessThan(dentro.indexOf('<FechaHoraFirma>'));

    const tarde = svc.generateXml(
      mk('e-CF_34_v_1_0', [L('Corrige', 500, 4)], {
        ncfModificado: 'E310000000005',
        fechaNcfModificado: '2026-08-01',
        codigoModificacion: 3,
      }),
      1,
      {},
    );
    expect(tag(tarde, 'IndicadorNotaCredito')).toBe('1');
  });
});
