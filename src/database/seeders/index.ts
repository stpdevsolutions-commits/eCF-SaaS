import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../auth/entities/user.entity';
import { Ecf } from '../../ecf/entities/ecf.entity';
import { LineaEcf } from '../../ecf/entities/linea-ecf.entity';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'ecf_saas',
  entities: [User, Ecf, LineaEcf],
  synchronize: true,
});

async function seedDatabase() {
  try {
    await AppDataSource.initialize();
    console.log('Conectado a BD');

    const userRepository = AppDataSource.getRepository(User);
    const ecfRepository = AppDataSource.getRepository(Ecf);
    const lineaRepository = AppDataSource.getRepository(LineaEcf);

    await lineaRepository.delete({});
    await ecfRepository.delete({});
    await userRepository.delete({});

    const hashedPassword = await bcrypt.hash('password123', 10);
    const usuario = userRepository.create({
      nombre: 'Juan Pérez',
      email: 'juan@example.com',
      password: hashedPassword,
      numeroRegistro: '12345678901',
      tipoPersona: 'juridica',
      tipoContribuyente: 'regimen_ordinario',
      razonSocial: 'Mi Empresa S.A.',
      direccion: 'Calle Principal 123',
      telefono: '+1-809-555-1234',
      activo: true,
    });

    const usuarioGuardado = await userRepository.save(usuario);
    console.log('✅ Usuario creado:', usuarioGuardado.email);

    for (let i = 1; i <= 3; i++) {
      const ecf = ecfRepository.create({
        tipoEcf: 'e-CF_31_v_1_0',
        version: 'v1.0',
        fechaEmision: new Date(),
        rncEmisor: '12345678901',
        nombreEmisor: 'Mi Empresa S.A.',
        rncComprador: `987654321${i.toString().padStart(2, '0')}`,
        nombreComprador: `Cliente ${i}`,
        montoTotal: 1180 * i,
        montoDescuento: 0,
        montoITBIS: 180 * i,
        moneda: 'RD',
        estado: 'draft',
        usuario: usuarioGuardado,
      });

      const ecfGuardado = await ecfRepository.save(ecf);

      for (let j = 1; j <= 2; j++) {
        const linea = lineaRepository.create({
          numero: j,
          descripcion: `Producto ${j} - Factura ${i}`,
          cantidad: j,
          precioUnitario: 500,
          descuentoLinea: 0,
          subtotal: 500 * j,
          itbis: 90 * j,
          ecf: ecfGuardado,
        });

        await lineaRepository.save(linea);
      }

      console.log(`✅ ECF ${i} creado con líneas`);
    }

    console.log('✅ Seeding completado');
    process.exit(0);
  } catch (error) {
    console.error('Error en seeding:', error);
    process.exit(1);
  }
}

seedDatabase();
