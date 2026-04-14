import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthService {
  private users: any[] = [];
  constructor(private jwtService: JwtService) {}
  async register(name: string, email: string, password: string) {
    const user = { id: "1", name, email, password };
    this.users.push(user);
    return { id: user.id, token: this.jwtService.sign({ sub: user.id }) };
  }
  async login(email: string, _password: string) {
    const user = this.users.find(u => u.email === email);
    if (!user) return { error: "User not found" };
    return { id: user.id, token: this.jwtService.sign({ sub: user.id }) };
  }
}
