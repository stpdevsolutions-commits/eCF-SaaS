import { Test, TestingModule } from '@nestjs/testing';
import { XsdValidatorService } from './xsd-validator.service';

describe('XsdValidatorService', () => {
  let service: XsdValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [XsdValidatorService],
    }).compile();

    service = module.get(XsdValidatorService);
  });

  const baseData = () => ({
    rncEmisor: '101000001',
    tipoEcf: 'e-CF_31_v_1_0',
    montoTotal: 1180,
    nombreEmisor: 'Empresa Emisora',
    nombreComprador: 'Cliente',
    lineas: [{ descripcion: 'Producto', cantidad: 1, precioUnitario: 1000 }],
  });

  describe('validateEcf — RNC Comprador', () => {
    it('exige rncComprador para e-CF_31 (Factura de Crédito Fiscal)', () => {
      const result = service.validateEcf({ ...baseData(), rncComprador: undefined });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('RNC Comprador inválido (debe ser 9-11 dígitos)');
    });

    it('NO exige rncComprador para e-CF_32 (Factura de Consumo)', () => {
      const result = service.validateEcf({
        ...baseData(),
        tipoEcf: 'e-CF_32_v_1_0',
        rncComprador: undefined,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('valida el formato si rncComprador viene presente en un e-CF_32', () => {
      const result = service.validateEcf({
        ...baseData(),
        tipoEcf: 'e-CF_32_v_1_0',
        rncComprador: 'no-son-digitos',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('RNC Comprador inválido (debe ser 9-11 dígitos)');
    });

    it('acepta un e-CF_32 con rncComprador válido (venta con RNC opcionalmente presente)', () => {
      const result = service.validateEcf({
        ...baseData(),
        tipoEcf: 'e-CF_32_v_1_0',
        rncComprador: '101011010',
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('validateEcf — obligatoriedad del comprador por tipo (XSD oficiales)', () => {
    it.each(['e-CF_33_v_1_0', 'e-CF_34_v_1_0', 'e-CF_44_v_1_0', 'e-CF_46_v_1_0'])(
      '%s no exige rncComprador (opcional en el XSD)',
      (tipoEcf) => {
        const result = service.validateEcf({
          ...baseData(),
          tipoEcf,
          rncComprador: undefined,
          referencia: { ncfModificado: 'E310000000001', fechaNcfModificado: '2026-10-01', codigoModificacion: 3 },
        });
        expect(result.errors).not.toContain('RNC Comprador inválido (debe ser 9-11 dígitos)');
      },
    );

    it.each(['e-CF_41_v_1_0', 'e-CF_45_v_1_0'])('%s sigue exigiendo rncComprador', (tipoEcf) => {
      const result = service.validateEcf({ ...baseData(), tipoEcf, rncComprador: undefined });
      expect(result.errors).toContain('RNC Comprador inválido (debe ser 9-11 dígitos)');
    });

    it('e-CF_43 (Gastos Menores) no tiene comprador: no exige nombre ni RNC', () => {
      const result = service.validateEcf({
        ...baseData(),
        tipoEcf: 'e-CF_43_v_1_0',
        rncComprador: undefined,
        nombreComprador: undefined,
      });
      expect(result.errors).toEqual([]);
    });

    it('e-CF_31 sigue exigiendo el nombre del comprador', () => {
      const result = service.validateEcf({ ...baseData(), rncComprador: '101011010', nombreComprador: undefined });
      expect(result.errors).toContain('Nombre Comprador requerido');
    });
  });

  describe('validateXmlStructure — TipoIngresos y Comprador según el tipo', () => {
    const xmlSinComprador = '<ECF><Encabezado><Version>1.0</Version><IdDoc><TipoeCF>43</TipoeCF><eNCF>E430000000001</eNCF></IdDoc></Encabezado></ECF>';

    it('e-CF_43 no exige <Comprador> ni <TipoIngresos>; e-CF_31 sí', () => {
      expect(service.validateXmlStructure(xmlSinComprador, 'e-CF_43_v_1_0').errors).not.toContain('Elemento requerido ausente: <Comprador>');
      expect(service.validateXmlStructure(xmlSinComprador, 'e-CF_43_v_1_0').errors).not.toContain('Elemento requerido ausente: <TipoIngresos>');
      expect(service.validateXmlStructure(xmlSinComprador, 'e-CF_31_v_1_0').errors).toEqual(
        expect.arrayContaining(['Elemento requerido ausente: <Comprador>', 'Elemento requerido ausente: <TipoIngresos>']),
      );
    });
  });

  describe('validateXmlStructure — RNCComprador', () => {
    const xmlSinRncComprador = `<ECF>
      <Encabezado><Version>1.0</Version><IdDoc><TipoeCF>32</TipoeCF><eNCF>E320000000001</eNCF><TipoIngresos>01</TipoIngresos><TipoPago>1</TipoPago></IdDoc>
      <Emisor><RNCEmisor>101000001</RNCEmisor><RazonSocialEmisor>Emisor</RazonSocialEmisor><DireccionEmisor>Calle 1</DireccionEmisor><FechaEmision>22-09-2026</FechaEmision></Emisor>
      <Comprador><RazonSocialComprador>Consumidor Final</RazonSocialComprador></Comprador>
      <Totales><MontoTotal>500.00</MontoTotal></Totales></Encabezado>
      <DetallesItems><Item><NumeroLinea>1</NumeroLinea><NombreItem>Producto</NombreItem><IndicadorFacturacion>1</IndicadorFacturacion><IndicadorBienoServicio>1</IndicadorBienoServicio><CantidadItem>1.00</CantidadItem><PrecioUnitarioItem>500.0000</PrecioUnitarioItem><MontoItem>500.00</MontoItem></Item></DetallesItems>
      <FechaHoraFirma>22-09-2026 10:00:00</FechaHoraFirma></ECF>`;

    it('e-CF_32 sin <RNCComprador> es válido', () => {
      const result = service.validateXmlStructure(xmlSinRncComprador, 'e-CF_32_v_1_0');

      expect(result.errors).not.toContain('Elemento requerido ausente: <RNCComprador>');
    });

    it('e-CF_31 sin <RNCComprador> es inválido', () => {
      const result = service.validateXmlStructure(xmlSinRncComprador, 'e-CF_31_v_1_0');

      expect(result.errors).toContain('Elemento requerido ausente: <RNCComprador>');
    });
  });
});
