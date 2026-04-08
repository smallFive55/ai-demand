export type UserRole = 'business' | 'delivery_manager' | 'admin'

export interface User {
  id: string
  name: string
  avatar?: string
  role: UserRole
  businessUnitIds?: string[]
  disabled: boolean
  createdAt: string
}

export interface BusinessUnit {
  id: string
  name: string
  features: string[]
  deliveryManagerId: string
  admissionCriteria: string
  minMatchScore: number
  createdAt: string
}
