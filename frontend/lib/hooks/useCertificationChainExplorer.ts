import { useCallback } from 'react';
import {
  CertificationChainLink,
  CertificationChain,
  CertificationRecord,
  buildCertificationChain,
  isValidCertificationChain,
  getDependentCertifications,
} from '@/lib/services/certificationChainExplorer';

export function useCertificationChainExplorer() {
  const buildChain = useCallback(
    (
      rootCertId: string,
      links: CertificationChainLink[],
      certifications: Map<string, CertificationRecord>,
    ) => {
      return buildCertificationChain(rootCertId, links, certifications);
    },
    [],
  );

  const validateChain = useCallback((chain: CertificationChain): boolean => {
    return isValidCertificationChain(chain);
  }, []);

  const getDependents = useCallback((certId: string, chain: CertificationChain) => {
    return getDependentCertifications(certId, chain);
  }, []);

  return {
    buildChain,
    validateChain,
    getDependents,
  };
}
