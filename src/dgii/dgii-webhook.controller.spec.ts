import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DgiiWebhookController } from './dgii-webhook.controller';
import { DgiiReceptorService } from './dgii-receptor.service';

describe('DgiiWebhookController', () => {
  let controller: DgiiWebhookController;
  let receptorService: any;

  beforeEach(async () => {
    receptorService = {
      procesarRecepcion: jest.fn().mockResolvedValue('<ARECF/>'),
      procesarAprobacionComercial: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DgiiWebhookController],
      providers: [{ provide: DgiiReceptorService, useValue: receptorService }],
    }).compile();

    controller = module.get(DgiiWebhookController);
  });

  describe('recepcion', () => {
    it('usa el archivo multipart cuando viene adjunto', async () => {
      const files = [{ buffer: Buffer.from('<ECF>multipart</ECF>') }] as any;
      const req = { body: undefined } as any;

      const resultado = await controller.recepcion(files, req);

      expect(receptorService.procesarRecepcion).toHaveBeenCalledWith('<ECF>multipart</ECF>');
      expect(resultado).toBe('<ARECF/>');
    });

    it('usa el cuerpo como XML plano si no hay multipart', async () => {
      const req = { body: '<ECF>plano</ECF>' } as any;

      await controller.recepcion(undefined, req);

      expect(receptorService.procesarRecepcion).toHaveBeenCalledWith('<ECF>plano</ECF>');
    });

    it('lanza BadRequestException si no hay XML en ninguna forma', async () => {
      const req = { body: undefined } as any;

      await expect(controller.recepcion(undefined, req)).rejects.toThrow(BadRequestException);
    });
  });

  describe('aprobacionComercial', () => {
    it('delega al servicio y responde ok', async () => {
      const req = { body: '<ACECF/>' } as any;

      const resultado = await controller.aprobacionComercial(undefined, req);

      expect(receptorService.procesarAprobacionComercial).toHaveBeenCalledWith('<ACECF/>');
      expect(resultado).toEqual({ ok: true });
    });
  });
});
