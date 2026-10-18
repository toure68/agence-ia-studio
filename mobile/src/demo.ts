import type { HomeData } from './models';
// Données fictives uniquement. Aucun connecteur, aucune requête métier.
export const demo: HomeData = {
  firstName: 'Mohamed', balance: 8450, receivable: 3200, payable: 1450, currency: 'EUR',
  actions: [
    { id: 'quote-dupont', kind: 'quote', title: 'Devis Dupont, 1 200 €, à envoyer', description: 'Il ne reste qu’à vérifier le montant avant l’envoi au client.', button: 'Finaliser et envoyer', icon: 'quote', tone: 'green', urgency: 3, importance: 3, important: true },
    { id: 'equipment-ladder', kind: 'equipment', title: 'Remplacer l’escabeau', description: 'Matériel à remplacer. Deux étapes : choisir un modèle, puis commander.', button: 'Commander', icon: 'case', tone: 'red', urgency: 3, importance: 2 },
    { id: 'document-invoice', kind: 'document', title: 'Vérifier une facture reçue', description: 'Une facture importée attend votre validation : la classer ou la supprimer.', button: 'Vérifier', icon: 'folder', tone: 'gold', urgency: 1, importance: 1 },
  ],
  modules: [
    { id: 'clients', name: 'Clients', count: 2, icon: 'user', tone: 'blue' },
    { id: 'quotes', name: 'Devis', count: 1, icon: 'quote', tone: 'green' },
    { id: 'agenda', name: 'Agenda', count: 3, icon: 'calendar', tone: 'blue' },
    { id: 'requests', name: 'Demandes', count: 1, icon: 'inbox', tone: 'blue' },
    { id: 'documents', name: 'Documents', count: 1, icon: 'folder', tone: 'gold' },
    { id: 'equipment', name: 'Matériel', count: 1, icon: 'case', tone: 'red' },
    { id: 'billing', name: 'Factures', count: 0, icon: 'quote', tone: 'blue' },
  ],
  insight: {
    title: 'Des devis plus clairs, des réponses plus rapides',
    summary: 'Exemple de veille pour la démonstration. Présenter clairement le périmètre, le prix et la prochaine étape permet au client de comprendre votre proposition. Une vraie information sur votre métier sera branchée après validation de l’écran.',
  },
};
