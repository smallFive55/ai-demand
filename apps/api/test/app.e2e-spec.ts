import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { Response } from 'supertest'
import { AppModule } from '../src/app.module'
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor'
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter'

describe('AppController (e2e)', () => {
  let app: INestApplication

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalInterceptors(new ResponseInterceptor())
    app.useGlobalFilters(new GlobalExceptionFilter())
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res: Response) => {
        expect(res.body).toHaveProperty('success', true)
        expect(res.body).toHaveProperty('data.status', 'ok')
        expect(res.body).toHaveProperty('data.service', 'ai-demand-api')
        expect(res.body).toHaveProperty('data.timestamp')
        expect(res.body).toHaveProperty('meta.occurredAt')
      })
  })

  it('/api/admin/accounts lifecycle (POST/PUT/POST-disable)', async () => {
    const rolesRes = await request(app.getHttpServer())
      .get('/api/admin/roles')
      .set('Authorization', 'Bearer admin:e2e')
      .expect(200)

    const roles = rolesRes.body.data as { id: string; name: string }[]
    const adminRole = roles.find((r) => r.name === 'admin')
    const managerRole = roles.find((r) => r.name === 'manager')
    expect(adminRole).toBeDefined()
    expect(managerRole).toBeDefined()

    const createRes = await request(app.getHttpServer())
      .post('/api/admin/accounts')
      .set('Authorization', 'Bearer admin:e2e')
      .set('x-request-id', 'req-create-1')
      .send({
        name: 'Alice',
        email: 'alice@example.com',
        roleId: adminRole!.id,
      })
      .expect(201)

    expect(createRes.body).toHaveProperty('success', true)
    expect(createRes.body).toHaveProperty('data.id')
    expect(createRes.body).toHaveProperty('data.status', 'enabled')

    const accountId = createRes.body.data.id as string

    const updateRes = await request(app.getHttpServer())
      .put(`/api/admin/accounts/${accountId}`)
      .set('Authorization', 'Bearer admin:e2e')
      .set('x-request-id', 'req-update-1')
      .send({
        name: 'Alice Zhang',
        roleId: managerRole!.id,
      })
      .expect(200)

    expect(updateRes.body).toHaveProperty('success', true)
    expect(updateRes.body).toHaveProperty('data.name', 'Alice Zhang')
    expect(updateRes.body).toHaveProperty('data.roleId', managerRole!.id)

    const disableRes = await request(app.getHttpServer())
      .post(`/api/admin/accounts/${accountId}/disable`)
      .set('Authorization', 'Bearer admin:e2e')
      .set('x-request-id', 'req-disable-1')
      .expect(200)

    expect(disableRes.body).toHaveProperty('success', true)
    expect(disableRes.body).toHaveProperty('data.status', 'disabled')
  })

  it('/api/admin/accounts/import (POST) keeps partial success and error reasons', async () => {
    const rolesRes = await request(app.getHttpServer())
      .get('/api/admin/roles')
      .set('Authorization', 'Bearer admin:e2e')
      .expect(200)
    const roles = rolesRes.body.data as { id: string; name: string }[]
    const viewerRole = roles.find((r) => r.name === 'viewer')
    expect(viewerRole).toBeDefined()

    const importRes = await request(app.getHttpServer())
      .post('/api/admin/accounts/import')
      .set('Authorization', 'Bearer admin:e2e')
      .set('x-request-id', 'req-import-1')
      .send({
        items: [
          {
            name: 'Bob',
            email: 'bob@example.com',
            roleId: viewerRole!.id,
          },
          {
            name: 'Broken',
            email: 'broken@example.com',
            roleId: 'missing-role',
          },
        ],
      })
      .expect(200)

    expect(importRes.body).toHaveProperty('success', true)
    expect(importRes.body).toHaveProperty('data.successCount', 1)
    expect(importRes.body).toHaveProperty('data.failureCount', 1)
    expect(importRes.body.data.errors[0]).toMatchObject({
      index: 1,
      reasonCode: 'ROLE_NOT_FOUND',
    })
  })

  it('/api/admin/accounts validates role existence and returns error envelope', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/accounts')
      .set('Authorization', 'Bearer admin:e2e')
      .set('x-request-id', 'req-create-invalid-role')
      .send({
        name: 'Eve',
        email: 'eve@example.com',
        roleId: 'non-existing',
      })
      .expect(400)

    expect(res.body).toHaveProperty('success', false)
    expect(res.body).toHaveProperty('error.message')
    expect(res.body).toHaveProperty('meta.occurredAt')
    expect(res.body).toHaveProperty('meta.requestId', 'req-create-invalid-role')
  })

  it('/api/admin/accounts requires admin authorization', async () => {
    const rolesRes = await request(app.getHttpServer())
      .get('/api/admin/roles')
      .set('Authorization', 'Bearer admin:e2e')
      .expect(200)
    const adminRole = (rolesRes.body.data as { id: string; name: string }[]).find((r) => r.name === 'admin')

    await request(app.getHttpServer())
      .post('/api/admin/accounts')
      .send({
        name: 'NoAuth',
        email: 'noauth@example.com',
        roleId: adminRole!.id,
      })
      .expect(401)
  })
})
