/**
 * Fake server WACM/Wasabi para desarrollo local, sin acceso a Wasabi real.
 * Levantar con: yarn mock:wasabi
 * Apuntar el repo a este server via WASABI_API_URL=http://localhost:4000/api
 */
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { randomInt } from 'crypto';

// Wasabi usa ids numericos
function randomId(): number {
  return randomInt(100_000_000, 999_999_999);
}

const PORT = parseInt(process.env.MOCK_PORT || '4000');
const FAKE_USERNAME = process.env.WASABI_API_USERNAME || 'fake';
const FAKE_PASSWORD = process.env.WASABI_API_TOKEN || 'fake';
const DB_FILE = process.env.MOCK_DB_FILE || path.join(__dirname, 'data.json');

interface IWasabiServerResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
  errors: { name: string; message: string; code: string | null; invalidValue: string }[] | null;
}

function ok<T>(data: T, message = 'OK'): IWasabiServerResponse<T> {
  return { success: true, code: '200', message, data, errors: null };
}

function fail(code: string, message: string): IWasabiServerResponse<null> {
  return {
    success: false,
    code,
    message,
    data: null,
    errors: [{ name: 'Error', message, code, invalidValue: '' }],
  };
}

interface ISubAccount {
  id: number;
  name: string;
  category: string | null;
  partnerType: string;
  accountType: string;
  status: 'ON_TRIAL' | 'PAID_ACCOUNT' | 'SUSPENDED';
  imageUrl: string | null;
  creationDate: string;
  address1: string | null;
  address2: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  mainPhone: string | null;
  billingPhone: string | null;
  contactEmail: string | null;
  billingEmail: string | null;
  businessNumber: string | null;
  taxId: string | null;
  fiscalNumber: string | null;
  vatNumber: string | null;
  website: string | null;
  controlAccountId: number | null;
  controlAccountName: string | null;
  controlAccountEmail: string | null;
  governanceAccountId: number | null;
  governanceAccountName: string | null;
  channelAccountId: number | null;
  channelAccountName: string | null;
  wasabiAccountNumber: string;
  wasabiAccountName: string;
  wasabiAccountEmail: string;
  sendPasswordResetToSubAccount: boolean;
  ftpEnabled: boolean;
  activeStorage: number;
  deletedStorage: number;
  trialQuota: number | null;
  trialExpiration: string | null;
  deleted: boolean;
  accessKey: string;
  secretKey: string;
}

interface IMember {
  id: number;
  subAccountId: string;
  firstName: string;
  lastName: string;
  username: string;
  memberRole: string;
  email: string;
  status: 'active' | 'deactivated' | 'suspended' | 'locked';
  mfa: boolean;
  imageUrl: string | null;
  creationDate: string;
  address1: string | null;
  address2: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
}

interface IChannelAccount {
  id: number;
  name: string;
  contactEmail: string;
  status: string;
  creationDate: string;
  billableActiveStorageTB: number;
}

interface IDbState {
  subAccounts: ISubAccount[];
  members: IMember[];
  channelAccounts: IChannelAccount[];
}

function defaultState(): IDbState {
  const subAccount: ISubAccount = {
    id: randomId(),
    name: 'fake-seed-account',
    category: null,
    partnerType: 'DIRECT',
    accountType: 'SUB_ACCOUNT',
    status: 'PAID_ACCOUNT',
    imageUrl: null,
    creationDate: new Date().toISOString(),
    address1: null,
    address2: null,
    country: null,
    city: null,
    state: null,
    zip: null,
    mainPhone: null,
    billingPhone: null,
    contactEmail: 'seed@example.com',
    billingEmail: 'seed@example.com',
    businessNumber: null,
    taxId: null,
    fiscalNumber: null,
    vatNumber: null,
    website: null,
    controlAccountId: 1,
    controlAccountName: 'fake-control-account',
    controlAccountEmail: 'control@example.com',
    governanceAccountId: null,
    governanceAccountName: null,
    channelAccountId: null,
    channelAccountName: null,
    wasabiAccountNumber: String(randomId()),
    wasabiAccountName: 'fake-seed-account',
    wasabiAccountEmail: 'seed@example.com',
    sendPasswordResetToSubAccount: false,
    ftpEnabled: true,
    activeStorage: 0,
    deletedStorage: 0,
    trialQuota: null,
    trialExpiration: null,
    deleted: false,
    accessKey: `FAKEACCESSKEY${randomId()}`,
    secretKey: `FAKESECRETKEY${randomId()}`,
  };

  const member: IMember = {
    id: randomId(),
    subAccountId: String(subAccount.id),
    firstName: 'Fake',
    lastName: 'Object Storage',
    username: 'seed-user',
    memberRole: 'Root',
    email: 'seed-member@example.com',
    status: 'active',
    mfa: false,
    imageUrl: null,
    creationDate: new Date().toISOString(),
    address1: null,
    address2: null,
    country: null,
    city: null,
    state: null,
    zip: null,
    phone: null,
  };

  return {
    subAccounts: [subAccount],
    members: [member],
    channelAccounts: [],
  };
}

function loadState(): IDbState {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (err) {
      console.error(`No se pudo leer ${DB_FILE}, se usa estado por defecto.`, err);
    }
  }
  return defaultState();
}

const state = loadState();

function persist(): void {
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
}

const subAccounts = state.subAccounts;
const members = state.members;
const channelAccounts = state.channelAccounts;

function paginate<T>(items: T[], page = 0, size = 20) {
  const start = page * size;
  return {
    items: items.slice(start, start + size),
    totalItems: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / size)),
    currentPage: page,
    pageSize: size,
  };
}

const app = express();
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization || '';
  const expected = `Basic ${Buffer.from(`${FAKE_USERNAME}:${FAKE_PASSWORD}`).toString('base64')}`;
  if (header !== expected) {
    return res.status(200).json(fail('401', 'Unauthorized'));
  }
  next();
});

// POST /v1/sub-accounts
app.post('/api/v1/sub-accounts', (req: Request, res: Response) => {
  const body = req.body;
  const exists = subAccounts.find((sa) => sa.wasabiAccountEmail === body.wasabiAccountEmail);
  if (exists) {
    return res.json(fail('409', `Sub-account with email ${body.wasabiAccountEmail} already exists`));
  }

  const id = randomId();
  const created: ISubAccount = {
    id,
    name: body.name,
    category: null,
    partnerType: 'DIRECT',
    accountType: 'SUB_ACCOUNT',
    status: body.isTrial ? 'ON_TRIAL' : 'PAID_ACCOUNT',
    imageUrl: null,
    creationDate: new Date().toISOString(),
    address1: null,
    address2: null,
    country: null,
    city: null,
    state: null,
    zip: null,
    mainPhone: null,
    billingPhone: null,
    contactEmail: body.wasabiAccountEmail,
    billingEmail: body.wasabiAccountEmail,
    businessNumber: null,
    taxId: null,
    fiscalNumber: null,
    vatNumber: null,
    website: null,
    controlAccountId: body.controlAccountId ?? null,
    controlAccountName: 'fake-control-account',
    controlAccountEmail: 'control@example.com',
    governanceAccountId: null,
    governanceAccountName: null,
    channelAccountId: body.channelAccountId ?? null,
    channelAccountName: body.channelAccountId ? 'fake-channel-account' : null,
    wasabiAccountNumber: String(randomId()),
    wasabiAccountName: body.name,
    wasabiAccountEmail: body.wasabiAccountEmail,
    sendPasswordResetToSubAccount: !!body.sendPasswordResetToSubAccountEmail,
    ftpEnabled: !!body.ftpEnabled,
    activeStorage: 0,
    deletedStorage: 0,
    trialQuota: body.trialQuotaTB ?? null,
    trialExpiration: body.isTrial && body.trialDays
      ? new Date(Date.now() + body.trialDays * 24 * 60 * 60 * 1000).toISOString()
      : null,
    deleted: false,
    accessKey: `FAKEACCESSKEY${randomId()}`,
    secretKey: `FAKESECRETKEY${randomId()}`,
  };

  subAccounts.push(created);
  persist();

  res.json(
    ok({
      id: created.id,
      name: created.name,
      wasabiAccountNumber: created.wasabiAccountNumber,
      wasabiAccountEmail: created.wasabiAccountEmail,
      creationDate: created.creationDate,
      status: created.status,
      sendPasswordResetToSubAccountEmail: created.sendPasswordResetToSubAccount,
      ftpEnabled: created.ftpEnabled,
      trialQuotaTB: created.trialQuota,
      trialExpiration: created.trialExpiration,
      purchasedStorageTB: null,
      accessKey: created.accessKey,
      secretKey: created.secretKey,
      channelAccountId: created.channelAccountId,
      channelAccountName: created.channelAccountName,
    }),
  );
});

// GET /v1/sub-accounts
app.get('/api/v1/sub-accounts', (req: Request, res: Response) => {
  const { id, controlAccountId, channelAccountId, status, includeDeleted, includeKeys, page, size, pageSize } =
    req.query;

  let result = subAccounts.filter((sa) => includeDeleted === 'true' || !sa.deleted);
  if (id) result = result.filter((sa) => sa.id === Number(id));
  if (controlAccountId) result = result.filter((sa) => sa.controlAccountId === Number(controlAccountId));
  if (channelAccountId) result = result.filter((sa) => sa.channelAccountId === Number(channelAccountId));
  if (status) result = result.filter((sa) => sa.status === status);

  const pageNum = page ? Number(page) : 0;
  const sizeNum = size ? Number(size) : pageSize ? Number(pageSize) : result.length || 20;
  const { items } = paginate(result, pageNum, sizeNum);

  const mapped = items.map((sa) => {
    if (includeKeys === 'true') return sa;
    return Object.fromEntries(Object.entries(sa).filter(([key]) => key !== 'accessKey' && key !== 'secretKey'));
  });

  res.json(ok({ items: mapped }));
});

function findSubAccount(id: string): ISubAccount | undefined {
  return subAccounts.find((sa) => sa.id === Number(id));
}

// PUT /v1/sub-accounts/:id
app.put('/api/v1/sub-accounts/:id', (req: Request, res: Response) => {
  const sa = findSubAccount(req.params.id);
  if (!sa) return res.json(fail('404', `Sub-account ${req.params.id} not found`));

  Object.assign(sa, req.body);
  persist();
  res.json(ok(null));
});

// PATCH /v1/sub-accounts/:id
app.patch('/api/v1/sub-accounts/:id', (req: Request, res: Response) => {
  const sa = findSubAccount(req.params.id);
  if (!sa) return res.json(fail('404', `Sub-account ${req.params.id} not found`));

  const { active, ...rest } = req.body;
  if (active !== undefined) {
    sa.status = active ? 'PAID_ACCOUNT' : 'SUSPENDED';
  }
  Object.assign(sa, rest);
  persist();
  res.json(ok(null));
});

// DELETE /v1/sub-accounts/:id
app.delete('/api/v1/sub-accounts/:id', (req: Request, res: Response) => {
  const sa = findSubAccount(req.params.id);
  if (!sa) return res.json(fail('404', `Sub-account ${req.params.id} not found`));

  sa.deleted = true;
  persist();
  res.json(ok(null));
});

// POST /v1/members
app.post('/api/v1/members', (req: Request, res: Response) => {
  const body = req.body;
  const created: IMember = {
    id: randomId(),
    subAccountId: body.subAccountId,
    firstName: body.firstName,
    lastName: body.lastName,
    username: body.username,
    memberRole: body.memberRole,
    email: body.email,
    status: 'active',
    mfa: false,
    imageUrl: null,
    creationDate: new Date().toISOString(),
    address1: null,
    address2: null,
    country: null,
    city: null,
    state: null,
    zip: null,
    phone: null,
  };
  members.push(created);
  persist();

  res.json(
    ok({
      ...body,
      id: String(created.id),
      status: created.status,
      mfa: created.mfa,
      imageUrl: created.imageUrl,
      creationDate: created.creationDate,
      address1: created.address1,
      address2: created.address2,
      country: created.country,
      city: created.city,
      state: created.state,
      zip: created.zip,
      phone: created.phone,
    }),
  );
});

// GET /v1/members
app.get('/api/v1/members', (req: Request, res: Response) => {
  const { id, status, username, subAccountId, page, size } = req.query;

  let result = members;
  if (id) result = result.filter((m) => m.id === Number(id));
  if (status) result = result.filter((m) => m.status === status);
  if (username) result = result.filter((m) => m.username === username);
  if (subAccountId) result = result.filter((m) => m.subAccountId === String(subAccountId));

  const pageNum = page ? Number(page) : 0;
  const sizeNum = size ? Number(size) : result.length || 20;

  res.json(ok(paginate(result, pageNum, sizeNum)));
});

function fakeBucket(bucketNumber: number, name: string) {
  return {
    id: bucketNumber,
    startTime: new Date(Date.now() - 86400000).toISOString(),
    endTime: new Date().toISOString(),
    activeStorage: 1024 * 1024 * 100,
    deletedStorage: 0,
    storageWrote: 1024 * 1024 * 50,
    storageRead: 1024 * 1024 * 20,
    activeObjects: 42,
    deletedObjects: 0,
    egress: 1024 * 1024,
    ingress: 1024 * 1024 * 2,
    apiCalls: 1000,
    name,
    region: 'eu-central-1',
    bucketNumber,
  };
}

// GET /v1/sub-accounts/:id/buckets
app.get('/api/v1/sub-accounts/:id/buckets', (req: Request, res: Response) => {
  const sa = findSubAccount(req.params.id);
  if (!sa) return res.json(fail('404', `Sub-account ${req.params.id} not found`));

  res.json(ok({ buckets: [fakeBucket(1, 'fake-bucket-1')] }));
});

// GET /v1/control-accounts/:controlAccountId/buckets
app.get('/api/v1/control-accounts/:controlAccountId/buckets', (_req: Request, res: Response) => {
  res.json(ok({ buckets: [fakeBucket(1, 'fake-bucket-1'), fakeBucket(2, 'fake-bucket-2')] }));
});

// GET /v1/usages
app.get('/api/v1/usages', (req: Request, res: Response) => {
  const { page, size } = req.query;
  const pageNum = page ? Number(page) : 0;
  const sizeNum = size ? Number(size) : 20;

  const usageItems = subAccounts.map((sa) => ({
    subAccountId: sa.id,
    subAccountName: sa.name,
    activeStorage: sa.activeStorage,
    deletedStorage: sa.deletedStorage,
    date: new Date().toISOString(),
  }));

  res.json(ok(paginate(usageItems, pageNum, sizeNum)));
});

// GET /v1/invoices
app.get('/api/v1/invoices', (_req: Request, res: Response) => {
  res.json(
    ok({
      items: [
        {
          id: 1,
          invoiceNumber: 'FAKE-INV-0001',
          startTime: new Date(Date.now() - 30 * 86400000).toISOString(),
          endTime: new Date().toISOString(),
          totalAmount: 12.34,
          status: 'PAID',
          subAccountId: subAccounts[0]?.id ?? randomId(),
          subAccountName: subAccounts[0]?.name ?? 'fake-seed-account',
          controlAccountId: 1,
          controlAccountName: 'fake-control-account',
        },
      ],
    }),
  );
});

// GET /v1/channel-accounts
app.get('/api/v1/channel-accounts', (req: Request, res: Response) => {
  const { page, size, status } = req.query;
  let result = channelAccounts;
  if (status) result = result.filter((ca) => ca.status === status);

  const pageNum = page ? Number(page) : 0;
  const sizeNum = size ? Number(size) : result.length || 20;

  res.json(ok(paginate(result, pageNum, sizeNum)));
});

// POST /v1/channel-accounts
app.post('/api/v1/channel-accounts', (req: Request, res: Response) => {
  const created: IChannelAccount = {
    id: randomId(),
    name: req.body.name,
    contactEmail: req.body.contactEmail,
    status: 'ACTIVE',
    creationDate: new Date().toISOString(),
    billableActiveStorageTB: 0,
  };
  channelAccounts.push(created);
  persist();
  res.json(ok(created));
});

// PUT /v1/channel-accounts/:id
app.put('/api/v1/channel-accounts/:id', (req: Request, res: Response) => {
  const ca = channelAccounts.find((c) => c.id === Number(req.params.id));
  if (!ca) return res.json(fail('404', `Channel account ${req.params.id} not found`));

  Object.assign(ca, req.body);
  persist();
  res.json(ok(null));
});

app.listen(PORT, () => {
  console.log(`Fake Wasabi (WACM) server escuchando en http://localhost:${PORT}/api`);
  console.log(`Basic Auth esperado: ${FAKE_USERNAME}:${FAKE_PASSWORD}`);
});
