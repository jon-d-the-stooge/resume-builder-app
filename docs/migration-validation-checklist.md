# Migration Validation Checklist

Manual QA steps to verify the web migration is complete and functioning correctly.

---

## Functionality

- [ ] Can create/edit/delete vaults
- [ ] Can run optimization jobs
- [ ] Job status updates correctly
- [ ] Results display properly
- [ ] Knowledge base links work
- [ ] Settings persist
- [ ] User data is isolated

---

## Performance

- [ ] Page load under 3 seconds
- [ ] API responses under 500ms (excluding LLM calls)
- [ ] Job queue handles concurrent jobs

---

## Security

- [ ] Unauthenticated requests rejected
- [ ] Users cannot access other users' data
- [ ] No sensitive data in logs
- [ ] HTTPS enforced (production)

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Tester | | | |
| Developer | | | |
| Product Owner | | | |
