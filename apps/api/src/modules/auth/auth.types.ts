export interface LoginInput {
  username: string
  password: string
}

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: string
  status: 'enabled' | 'disabled'
  passwordHash: string
  passwordSalt: string
  createdAt: string
  updatedAt: string
}

export interface LoginResult {
  token: string
  user: {
    id: string
    name: string
    role: string
  }
}
