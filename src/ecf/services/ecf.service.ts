import { Injectable } from "@nestjs/common";

@Injectable()
export class EcfService {
  private ecfs: any[] = [];
  async create(data: any) { this.ecfs.push(data); return data; }
  async findAll() { return this.ecfs; }
}
