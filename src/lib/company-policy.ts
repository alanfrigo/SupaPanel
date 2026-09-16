export const companyRoles = ['owner', 'admin', 'developer', 'viewer'] as const
export type CompanyRole = typeof companyRoles[number]
export type CompanyAction = 'read' | 'operate' | 'manage'
export function allowedRoles(action: CompanyAction): CompanyRole[] {
  if (action === 'manage') return ['owner', 'admin']
  if (action === 'operate') return ['owner', 'admin', 'developer']
  return [...companyRoles]
}
export function can(role: string, action: CompanyAction) {
  return allowedRoles(action).some(value => value === role)
}
